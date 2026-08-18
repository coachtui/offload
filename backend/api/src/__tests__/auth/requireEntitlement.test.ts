/**
 * requireEntitlement — the enforcement half of the paywall.
 *
 * Pinned behaviors: 403 with the exact ENTITLEMENT_REQUIRED code (the client
 * maps that string to the paywall; 401 would sign the user out — "trial
 * ended" must never become "logged out"), and fail-open on infrastructure
 * error (a DB blip must not lock a paying user out of what they paid for).
 */
import { requireEntitlement } from '../../auth/requireEntitlement';
import * as entitlementService from '../../services/entitlementService';

jest.mock('../../services/entitlementService');
jest.mock('../../db/queries');
jest.mock('../../db/connection', () => ({ pool: { query: jest.fn() } }));

const mockService = entitlementService as jest.Mocked<typeof entitlementService>;

function run(user?: { id: string; email: string }) {
  const req = { user } as any;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as any;
  const next = jest.fn();
  return { req, res, next, status, json };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Delegate to the real isEntitled so the middleware test exercises the
  // actual policy, not a mock of it.
  mockService.isEntitled.mockImplementation(
    jest.requireActual('../../services/entitlementService').isEntitled
  );
});

it('passes an entitled user through', async () => {
  mockService.getEntitlementState.mockResolvedValue({
    entitlement: 'grandfathered',
    entitlementExpiresAt: null,
  });
  const { req, res, next } = run({ id: 'u-1', email: 'a@b.c' });

  await requireEntitlement(req, res, next);

  expect(next).toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalled();
});

it('403 ENTITLEMENT_REQUIRED for a lapsed user — not 401', async () => {
  mockService.getEntitlementState.mockResolvedValue({
    entitlement: 'none',
    entitlementExpiresAt: null,
  });
  const { req, res, next, status, json } = run({ id: 'u-1', email: 'a@b.c' });

  await requireEntitlement(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(403);
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({ error: 'ENTITLEMENT_REQUIRED' })
  );
});

it('401 when unauthenticated (middleware misordered)', async () => {
  const { req, res, next, status } = run(undefined);

  await requireEntitlement(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(401);
});

it('fails open when the entitlement lookup throws', async () => {
  mockService.getEntitlementState.mockRejectedValue(new Error('db down'));
  const { req, res, next } = run({ id: 'u-1', email: 'a@b.c' });

  await requireEntitlement(req, res, next);

  expect(next).toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalled();
});
