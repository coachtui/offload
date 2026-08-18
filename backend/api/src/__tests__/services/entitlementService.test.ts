/**
 * Entitlement — the server-side authority behind the paywall.
 *
 * The properties worth pinning are exactly the webhook hazards the service
 * exists to absorb: a retried event must be a no-op (RevenueCat redelivers
 * until 2xx), an out-of-order EXPIRATION must not undo the RENEWAL that
 * superseded it, and 'grandfathered' must survive every event type — a
 * pre-paywall account that subscribes and later lapses must not lose
 * free-forever status. Regressions here are invisible until they are a
 * paying user locked out, or a free-forever promise silently broken.
 */
import {
  applyWebhookEvent,
  isEntitled,
  RevenueCatEvent,
} from '../../services/entitlementService';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
jest.mock('../../db/connection', () => ({ pool: { query: jest.fn() } }));

const mockQueries = queries as jest.Mocked<typeof queries>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = new Date('2026-08-18T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function event(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER_ID,
    event_timestamp_ms: NOW.getTime(),
    expiration_at_ms: NOW.getTime() + 14 * DAY_MS,
    period_type: 'TRIAL',
    ...overrides,
  };
}

/**
 * queryOne is called up to three times per apply: the event-ledger INSERT,
 * the guarded users UPDATE, and (only when the guard refuses) a SELECT to
 * name the reason. Program each in order.
 */
function programQueryOne(results: Array<object | null>) {
  const fn = mockQueries.queryOne as jest.Mock;
  fn.mockReset();
  for (const r of results) fn.mockResolvedValueOnce(r);
}

describe('isEntitled', () => {
  it('grandfathered is entitled forever, expiry ignored', () => {
    expect(
      isEntitled(
        { entitlement: 'grandfathered', entitlementExpiresAt: new Date(NOW.getTime() - DAY_MS) },
        NOW
      )
    ).toBe(true);
  });

  it('active with future expiry is entitled', () => {
    expect(
      isEntitled(
        { entitlement: 'active', entitlementExpiresAt: new Date(NOW.getTime() + DAY_MS) },
        NOW
      )
    ).toBe(true);
  });

  it('trialing within the 24h webhook-lag grace stays entitled', () => {
    // Expired 1h ago; the renewal webhook may simply not have landed yet.
    expect(
      isEntitled(
        { entitlement: 'trialing', entitlementExpiresAt: new Date(NOW.getTime() - 60 * 60 * 1000) },
        NOW
      )
    ).toBe(true);
  });

  it('active past expiry + grace is not entitled', () => {
    expect(
      isEntitled(
        { entitlement: 'active', entitlementExpiresAt: new Date(NOW.getTime() - 2 * DAY_MS) },
        NOW
      )
    ).toBe(false);
  });

  it('none is never entitled', () => {
    expect(isEntitled({ entitlement: 'none', entitlementExpiresAt: null }, NOW)).toBe(false);
  });
});

describe('applyWebhookEvent', () => {
  it('applies a trial INITIAL_PURCHASE', async () => {
    programQueryOne([{ event_id: 'evt-1' }, { id: USER_ID }]);

    const result = await applyWebhookEvent(event());

    expect(result).toBe('applied');
    const updateCall = (mockQueries.queryOne as jest.Mock).mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE hub.users');
    expect(updateCall[1][1]).toBe('trialing'); // period_type TRIAL → trialing
  });

  it('a redelivered event is a duplicate no-op (idempotency gate)', async () => {
    // ON CONFLICT DO NOTHING returns no row → already processed.
    programQueryOne([null]);

    const result = await applyWebhookEvent(event());

    expect(result).toBe('duplicate');
    expect(mockQueries.queryOne).toHaveBeenCalledTimes(1); // never reached the UPDATE
  });

  it('a stale event (older than applied state) is recorded but not applied', async () => {
    // Ledger insert succeeds (new event id), but the guarded UPDATE matches no
    // row because entitlement_event_at is newer; the SELECT explains why.
    programQueryOne([{ event_id: 'evt-old' }, null, { entitlement: 'active' }]);

    const result = await applyWebhookEvent(
      event({ id: 'evt-old', type: 'EXPIRATION', event_timestamp_ms: NOW.getTime() - DAY_MS })
    );

    expect(result).toBe('stale');
  });

  it('never overwrites grandfathered', async () => {
    programQueryOne([{ event_id: 'evt-2' }, null, { entitlement: 'grandfathered' }]);

    const result = await applyWebhookEvent(event({ id: 'evt-2', type: 'EXPIRATION' }));

    expect(result).toBe('grandfathered_untouched');
  });

  it('CANCELLATION carries no state change (entitled until expiry)', async () => {
    programQueryOne([{ event_id: 'evt-3' }]);

    const result = await applyWebhookEvent(event({ id: 'evt-3', type: 'CANCELLATION' }));

    expect(result).toBe('no_state_change');
    expect(mockQueries.queryOne).toHaveBeenCalledTimes(1);
  });

  it('a non-uuid app_user_id is recorded, never queried against users', async () => {
    // "$RCAnonymousID:…" would throw on a uuid cast and turn into a 500 →
    // RevenueCat retry storm. It must short-circuit after the ledger insert.
    programQueryOne([{ event_id: 'evt-4' }]);

    const result = await applyWebhookEvent(
      event({ id: 'evt-4', app_user_id: '$RCAnonymousID:abc123' })
    );

    expect(result).toBe('unknown_user');
    expect(mockQueries.queryOne).toHaveBeenCalledTimes(1);
    // The ledger row stores NULL for user_id, not the anonymous string.
    expect((mockQueries.queryOne as jest.Mock).mock.calls[0][1][1]).toBeNull();
  });

  it('unknown (deleted) user is acknowledged, not an error', async () => {
    programQueryOne([{ event_id: 'evt-5' }, null, null]);

    const result = await applyWebhookEvent(event({ id: 'evt-5' }));

    expect(result).toBe('unknown_user');
  });

  it('a promotional grant (NON_RENEWING_PURCHASE) entitles as active', async () => {
    // Dashboard grants arrive as this type; ignoring them entitled nobody.
    programQueryOne([{ event_id: 'evt-promo' }, { id: USER_ID }]);

    const result = await applyWebhookEvent(
      event({ id: 'evt-promo', type: 'NON_RENEWING_PURCHASE', period_type: 'PROMOTIONAL' })
    );

    expect(result).toBe('applied');
    expect((mockQueries.queryOne as jest.Mock).mock.calls[1][1][1]).toBe('active');
  });

  it('EXPIRATION flips to none', async () => {
    programQueryOne([{ event_id: 'evt-6' }, { id: USER_ID }]);

    const result = await applyWebhookEvent(event({ id: 'evt-6', type: 'EXPIRATION' }));

    expect(result).toBe('applied');
    expect((mockQueries.queryOne as jest.Mock).mock.calls[1][1][1]).toBe('none');
  });
});
