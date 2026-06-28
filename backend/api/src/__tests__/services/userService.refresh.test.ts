/**
 * Unit tests for refreshSession — exchanging a refresh token for a fresh
 * access token (+ rotated refresh token).
 */
import { refreshSession } from '../../services/userService';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../../auth/jwt';
import { User } from '../../models/User';

jest.mock('../../models/User');

const mockUser = User as jest.Mocked<typeof User>;

describe('refreshSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a fresh access token for a valid refresh token of an existing user', async () => {
    mockUser.findById.mockResolvedValue({ id: 'user-1', email: 'a@b.com' } as any);
    const refreshToken = generateRefreshToken('user-1', 'a@b.com');

    const result = await refreshSession(refreshToken);

    expect(result.user).toEqual({ id: 'user-1', email: 'a@b.com' });
    const decoded = verifyToken(result.accessToken);
    expect(decoded.type).toBe('access');
    expect(decoded.userId).toBe('user-1');
    expect(result.refreshToken).toBeTruthy();
  });

  it('rejects when the refresh token belongs to a deleted user', async () => {
    mockUser.findById.mockResolvedValue(null as any);
    const refreshToken = generateRefreshToken('ghost', 'gone@b.com');

    await expect(refreshSession(refreshToken)).rejects.toThrow('User not found');
  });

  it('rejects an access token passed in place of a refresh token', async () => {
    const access = generateAccessToken('user-1', 'a@b.com');
    await expect(refreshSession(access)).rejects.toThrow('Invalid token type');
    expect(mockUser.findById).not.toHaveBeenCalled();
  });
});
