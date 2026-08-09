/**
 * deleteAccount — the App Store 5.1.1(v) path.
 *
 * Two properties matter enough to pin. First, the deletion must be *gated*: a
 * wrong password must not delete anything, since there is no undo and no
 * confirmation step beyond this one. Second, it must be *unblockable*: Weaviate
 * or S3 being down cannot leave the user stuck in an account they asked to
 * leave, so those purges are best-effort and run after the authoritative
 * Postgres delete. A regression in either direction is invisible until it is
 * either a rejected build or a support ticket about a wiped account.
 */

import {
  deleteAccount,
  AccountNotFoundError,
  InvalidPasswordError,
} from '../../services/accountService';
import { User } from '../../models/User';
import * as queries from '../../db/queries';
import * as weaviate from '../../db/weaviate';
import * as storageService from '../../services/storageService';

jest.mock('../../models/User');
jest.mock('../../db/queries');
jest.mock('../../db/weaviate');
jest.mock('../../services/storageService');

const mockUserModel = User as jest.Mocked<typeof User>;
const mockQueries = queries as jest.Mocked<typeof queries>;
const mockWeaviate = weaviate as jest.Mocked<typeof weaviate>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;

const USER_ID = 'u-1';
const PASSWORD = 'correct-horse-battery';

let deleteUserRow: jest.Mock;
let verifyPassword: jest.Mock;
let batchDelete: jest.Mock;

function buildUser(): any {
  deleteUserRow = jest.fn().mockResolvedValue(undefined);
  verifyPassword = jest.fn().mockResolvedValue(true);
  return { id: USER_ID, delete: deleteUserRow, verifyPassword };
}

/** Minimal stand-in for the fluent `client.batch.objectsBatchDeleter()` chain. */
function mockWeaviateClient(responses: Array<{ matches: number; successful: number }>): void {
  let call = 0;
  batchDelete = jest.fn().mockImplementation(async () => {
    const results = responses[call] ?? { matches: 0, successful: 0 };
    call++;
    return { results };
  });

  const chain: any = {
    withClassName: () => chain,
    withWhere: () => chain,
    do: batchDelete,
  };

  mockWeaviate.getWeaviateClient.mockReturnValue({
    batch: { objectsBatchDeleter: () => chain },
  } as any);
}

describe('deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockUserModel.findById.mockResolvedValue(buildUser());
    mockQueries.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockQueries.queryMany.mockResolvedValue([]);
    mockStorage.deleteSessionAudio.mockResolvedValue(undefined);
    mockWeaviateClient([{ matches: 0, successful: 0 }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('gating', () => {
    it('deletes nothing when the password is wrong', async () => {
      verifyPassword.mockResolvedValue(false);

      await expect(deleteAccount(USER_ID, 'wrong')).rejects.toThrow(InvalidPasswordError);

      expect(deleteUserRow).not.toHaveBeenCalled();
      expect(batchDelete).not.toHaveBeenCalled();
      expect(mockStorage.deleteSessionAudio).not.toHaveBeenCalled();
    });

    it('rejects an unknown user without touching any store', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(deleteAccount(USER_ID, PASSWORD)).rejects.toThrow(AccountNotFoundError);

      expect(batchDelete).not.toHaveBeenCalled();
      expect(mockStorage.deleteSessionAudio).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('deletes the user row, the embeddings, and every session audio prefix', async () => {
      mockQueries.queryMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      mockWeaviateClient([
        { matches: 3, successful: 3 },
        { matches: 0, successful: 0 },
      ]);

      await deleteAccount(USER_ID, PASSWORD);

      expect(deleteUserRow).toHaveBeenCalledTimes(1);
      expect(batchDelete).toHaveBeenCalled();
      expect(mockStorage.deleteSessionAudio).toHaveBeenCalledWith('s-1');
      expect(mockStorage.deleteSessionAudio).toHaveBeenCalledWith('s-2');
    });

    it('collects session ids before the cascade removes those rows', async () => {
      const order: string[] = [];
      mockQueries.queryMany.mockImplementation(async () => {
        order.push('select-sessions');
        return [{ id: 's-1' }] as any;
      });
      deleteUserRow.mockImplementation(async () => {
        order.push('delete-user');
      });

      await deleteAccount(USER_ID, PASSWORD);

      expect(order).toEqual(['select-sessions', 'delete-user']);
    });

    it('stops purging embeddings once the filter stops matching', async () => {
      mockWeaviateClient([{ matches: 0, successful: 0 }]);

      await deleteAccount(USER_ID, PASSWORD);

      expect(batchDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('hub.user_categories', () => {
    it('is cleared before the user row, in case its FK does not cascade', async () => {
      const order: string[] = [];
      mockQueries.query.mockImplementation(async (sql: string) => {
        if (sql.includes('user_categories')) order.push('clear-categories');
        return { rows: [], rowCount: 0 } as any;
      });
      deleteUserRow.mockImplementation(async () => {
        order.push('delete-user');
      });

      await deleteAccount(USER_ID, PASSWORD);

      expect(order).toEqual(['clear-categories', 'delete-user']);
    });

    it('tolerates the table not existing at all', async () => {
      mockQueries.query.mockRejectedValue(
        Object.assign(new Error('relation "hub.user_categories" does not exist'), {
          code: '42P01',
        })
      );

      await expect(deleteAccount(USER_ID, PASSWORD)).resolves.toBeUndefined();
      expect(deleteUserRow).toHaveBeenCalledTimes(1);
    });

    it('does not delete the account when the clear fails for any other reason', async () => {
      mockQueries.query.mockRejectedValue(
        Object.assign(new Error('deadlock detected'), { code: '40P01' })
      );

      await expect(deleteAccount(USER_ID, PASSWORD)).rejects.toThrow('deadlock detected');
      expect(deleteUserRow).not.toHaveBeenCalled();
    });
  });

  describe('external stores cannot block the deletion', () => {
    it('still deletes the account when Weaviate is down', async () => {
      mockWeaviate.getWeaviateClient.mockImplementation(() => {
        throw new Error('weaviate unreachable');
      });

      await expect(deleteAccount(USER_ID, PASSWORD)).resolves.toBeUndefined();
      expect(deleteUserRow).toHaveBeenCalledTimes(1);
    });

    it('still deletes the account when S3 rejects', async () => {
      mockQueries.queryMany.mockResolvedValue([{ id: 's-1' }]);
      mockStorage.deleteSessionAudio.mockRejectedValue(new Error('s3 down'));

      await expect(deleteAccount(USER_ID, PASSWORD)).resolves.toBeUndefined();
      expect(deleteUserRow).toHaveBeenCalledTimes(1);
    });

    it('keeps purging later sessions after one of them fails', async () => {
      mockQueries.queryMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      mockStorage.deleteSessionAudio.mockRejectedValueOnce(new Error('s3 down'));

      await deleteAccount(USER_ID, PASSWORD);

      expect(mockStorage.deleteSessionAudio).toHaveBeenCalledWith('s-2');
    });

    it('logs orphaned data loudly enough to reconcile later', async () => {
      const errorSpy = jest.spyOn(console, 'error');
      mockQueries.queryMany.mockResolvedValue([{ id: 's-1' }]);
      mockStorage.deleteSessionAudio.mockRejectedValue(new Error('s3 down'));

      await deleteAccount(USER_ID, PASSWORD);

      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('ORPHANED_AUDIO');
      expect(logged).toContain('s-1');
    });

    it('gives up on a Weaviate pass that matches rows but deletes none', async () => {
      mockWeaviateClient([{ matches: 5, successful: 0 }]);

      await expect(deleteAccount(USER_ID, PASSWORD)).resolves.toBeUndefined();

      expect(batchDelete).toHaveBeenCalledTimes(1);
      expect(deleteUserRow).toHaveBeenCalledTimes(1);
    });
  });
});
