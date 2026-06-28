/**
 * Tests for login attempt limiting: report remaining attempts on bad
 * credentials, lock out after too many, and reset on success.
 */
import {
  loginWithLockout,
  InvalidCredentialsError,
  LoginLockoutError,
  loginAttemptLimiter,
  MAX_LOGIN_ATTEMPTS,
} from '../../services/userService';
import { User } from '../../models/User';

jest.mock('../../models/User');
const mockUser = User as jest.Mocked<typeof User>;

function fakeUser(passwordValid: boolean) {
  return {
    id: 'u1',
    email: 'a@b.com',
    verifyPassword: jest.fn().mockResolvedValue(passwordValid),
  } as any;
}

describe('loginWithLockout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tokens on correct credentials', async () => {
    mockUser.findByEmail.mockResolvedValue(fakeUser(true));
    const res = await loginWithLockout({ email: 'ok@b.com', password: 'secret123' });
    expect(res.accessToken).toBeTruthy();
  });

  it('reports remaining attempts on a wrong password', async () => {
    const email = 'wrong@b.com';
    loginAttemptLimiter.reset(email);
    mockUser.findByEmail.mockResolvedValue(fakeUser(false));

    await expect(loginWithLockout({ email, password: 'badpass12' })).rejects.toMatchObject({
      name: 'InvalidCredentialsError',
      attemptsRemaining: MAX_LOGIN_ATTEMPTS - 1,
    });
  });

  it('locks out after MAX_LOGIN_ATTEMPTS failures', async () => {
    const email = 'lock@b.com';
    loginAttemptLimiter.reset(email);
    mockUser.findByEmail.mockResolvedValue(fakeUser(false));

    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      await expect(
        loginWithLockout({ email, password: 'badpass12' })
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      loginWithLockout({ email, password: 'badpass12' })
    ).rejects.toBeInstanceOf(LoginLockoutError);
  });

  it('clears the failure counter after a successful login', async () => {
    const email = 'reset@b.com';
    loginAttemptLimiter.reset(email);

    mockUser.findByEmail.mockResolvedValue(fakeUser(false));
    await expect(
      loginWithLockout({ email, password: 'badpass12' })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    mockUser.findByEmail.mockResolvedValue(fakeUser(true));
    await loginWithLockout({ email, password: 'secret123' });

    // Counter reset → a fresh failure shows the full allowance again.
    mockUser.findByEmail.mockResolvedValue(fakeUser(false));
    await expect(loginWithLockout({ email, password: 'badpass12' })).rejects.toMatchObject({
      attemptsRemaining: MAX_LOGIN_ATTEMPTS - 1,
    });
  });
});
