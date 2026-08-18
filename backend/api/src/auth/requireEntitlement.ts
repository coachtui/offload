/**
 * Gate a route on an active subscription (or grandfathered status).
 *
 * NOT YET WIRED TO ANY ROUTE — deliberately. Per plans/paywall-1.2.0.md
 * Phase E: the enforcement wiring ships only alongside the mobile build that
 * can actually purchase, or every account registered between this deploy and
 * the 1.2.0 app release would be locked out of recording with no way to pay.
 * When 1.2.0 ships, apply this after `authenticate` on the gated route set
 * (voice, rag/spar, conversations, synthesis triggers, geofence creation) and
 * nowhere else — reads, note-state mutations, and deletes stay open so a
 * lapsed user keeps full access to their own data.
 *
 * Responds 403 ENTITLEMENT_REQUIRED — a code the client maps to the paywall.
 * Not 401: the mobile client treats 401 as session death and signs the user
 * out, which would turn "trial ended" into "logged out", a far worse moment.
 */
import { Request, Response, NextFunction } from 'express';
import { getEntitlementState, isEntitled } from '../services/entitlementService';

export async function requireEntitlement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const state = await getEntitlementState(req.user.id);
    if (state && isEntitled(state)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'ENTITLEMENT_REQUIRED',
      message: 'An active subscription is required for this feature.',
    });
  } catch (error) {
    // Fail open on infrastructure error: a DB blip must not lock paying users
    // out of the product they paid for. The gate exists to convert, not to be
    // a perfect wall; the webhook-written state is still the only authority.
    console.error('[requireEntitlement] check failed, allowing request:', error);
    next();
  }
}
