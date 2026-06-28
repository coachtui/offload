/**
 * Unit tests for refresh-token verification.
 */
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../auth/jwt';

const SECRET = process.env.JWT_SECRET as string;

describe('verifyRefreshToken', () => {
  it('accepts a valid refresh token and returns its payload', () => {
    const token = generateRefreshToken('user-1', 'a@b.com');
    const payload = verifyRefreshToken(token);
    expect(payload.userId).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.type).toBe('refresh');
  });

  it('rejects an access token (wrong type)', () => {
    const access = generateAccessToken('user-1', 'a@b.com');
    expect(() => verifyRefreshToken(access)).toThrow('Invalid token type');
  });

  it('rejects an expired refresh token', () => {
    const expired = jwt.sign(
      { userId: 'user-1', email: 'a@b.com', type: 'refresh' },
      SECRET,
      { expiresIn: '-1s' }
    );
    expect(() => verifyRefreshToken(expired)).toThrow('Token expired');
  });

  it('rejects a malformed token', () => {
    expect(() => verifyRefreshToken('not-a-jwt')).toThrow('Invalid token');
  });
});
