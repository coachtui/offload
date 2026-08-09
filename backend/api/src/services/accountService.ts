/**
 * Account service — account-level operations that span every store.
 *
 * App Store Guideline 5.1.1(v) requires that an app which creates accounts also
 * lets the user delete one from inside the app. "Email support to request it"
 * is explicitly not sufficient, so this has to be a real, immediate deletion.
 */

import { User } from '../models/User';
import { query, queryMany } from '../db/queries';
import { getWeaviateClient } from '../db/weaviate';
import { deleteSessionAudio } from './storageService';

export class AccountNotFoundError extends Error {
  constructor() {
    super('Account not found');
    this.name = 'AccountNotFoundError';
  }
}

export class InvalidPasswordError extends Error {
  constructor() {
    super('Password is incorrect');
    this.name = 'InvalidPasswordError';
  }
}

/** Weaviate caps a single batch delete; loop until the filter stops matching. */
const WEAVIATE_DELETE_PASSES = 20;

/**
 * Remove every embedding belonging to a user.
 *
 * Best-effort: see `deleteAccount` for why a failure here must not abort the
 * deletion.
 */
async function purgeUserEmbeddings(userId: string): Promise<void> {
  const c = getWeaviateClient();

  for (let pass = 0; pass < WEAVIATE_DELETE_PASSES; pass++) {
    const result = await c.batch
      .objectsBatchDeleter()
      .withClassName('AtomicObject')
      .withWhere({ path: ['userId'], operator: 'Equal', valueText: userId })
      .do();

    const matches = result.results?.matches ?? 0;
    if (matches === 0) return;

    console.log(
      `[accountService] Weaviate purge pass ${pass + 1} for user ${userId}: ` +
        `${result.results?.successful ?? 0}/${matches} deleted`
    );

    // A pass that matched rows but deleted none will not make progress on a
    // retry either — stop rather than spin.
    if ((result.results?.successful ?? 0) === 0) {
      throw new Error(`Weaviate matched ${matches} objects but deleted none`);
    }
  }

  console.warn(
    `[accountService] Weaviate purge for user ${userId} hit the pass limit; ` +
      `some embeddings may remain`
  );
}

/** Postgres error code for `relation does not exist`. */
const UNDEFINED_TABLE = '42P01';

/**
 * Clear `hub.user_categories` ahead of the user row.
 *
 * Every other user-scoped table is created by a migration with
 * `ON DELETE CASCADE`, so the row delete is enough for them. `user_categories`
 * is the exception: `UserCategory` reads and writes it but no migration creates
 * it, so whatever exists in a given environment was made by hand and its
 * foreign key may not cascade — in which case the user delete would fail with a
 * constraint violation and no account could ever be deleted. Clearing it first
 * costs nothing if the cascade is already there, and a missing table is fine.
 */
async function clearUserCategories(userId: string): Promise<void> {
  try {
    await query('DELETE FROM hub.user_categories WHERE user_id = $1', [userId]);
  } catch (error) {
    if ((error as { code?: string })?.code === UNDEFINED_TABLE) return;
    throw error;
  }
}

/**
 * Permanently delete a user and everything attached to them.
 *
 * Ordering is deliberate. Postgres is the source of truth and every user-scoped
 * table cascades from `hub.users`, so the row delete is what actually makes the
 * account gone. It runs first so that the promise we make the user ("your
 * account is deleted") is true the moment we return 204.
 *
 * The external stores are purged afterwards, best-effort. If Weaviate or S3 is
 * down we still complete the deletion rather than trapping the user in an
 * account they have asked to leave — the ids are logged first so any orphan is
 * recoverable from the logs.
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AccountNotFoundError();
  }

  const passwordValid = await user.verifyPassword(password);
  if (!passwordValid) {
    throw new InvalidPasswordError();
  }

  // Collected before the cascade removes the rows that point at this audio.
  const sessions = await queryMany<{ id: string }>(
    'SELECT id FROM hub.sessions WHERE user_id = $1',
    [userId]
  );
  const sessionIds = sessions.map((s) => s.id);

  console.log(
    `[accountService] ACCOUNT_DELETE_START user=${userId} sessions=${sessionIds.length} ` +
      `sessionIds=${JSON.stringify(sessionIds)}`
  );

  await clearUserCategories(userId);
  await user.delete();

  console.log(`[accountService] ACCOUNT_DELETE_DB_DONE user=${userId}`);

  try {
    await purgeUserEmbeddings(userId);
  } catch (error) {
    console.error(
      `[accountService] ORPHANED_EMBEDDINGS user=${userId} — account row is deleted ` +
        `but Weaviate purge failed:`,
      error
    );
  }

  for (const sessionId of sessionIds) {
    try {
      await deleteSessionAudio(sessionId);
    } catch (error) {
      console.error(
        `[accountService] ORPHANED_AUDIO user=${userId} session=${sessionId} — ` +
          `account row is deleted but S3 purge failed:`,
        error
      );
    }
  }

  console.log(`[accountService] ACCOUNT_DELETE_COMPLETE user=${userId}`);
}
