/**
 * Gate a route on an active subscription (or grandfathered status).
 *
 * Wired to the gated route set (voice capture, rag/spar, conversations,
 * synthesis trigger, geofence creation) and nowhere else — reads, note-state
 * mutations, and deletes stay open so a lapsed user keeps full access to
 * their own data.
 *
 * Enforcement is behind ENFORCE_ENTITLEMENTS (default OFF) because of the
 * plan's Phase E deploy-order rule: the app that can actually purchase must
 * be in users' hands before any route refuses. With the flag off this
 * middleware is a pass-through, so the wiring can merge and deploy inert;
 * flipping ENFORCE_ENTITLEMENTS=true on Railway turns the paywall on the day
 * the 1.2.0 build is live. Remove the flag (make enforcement unconditional)
 * once 1.2.0 has been the released app for a while — a flag nobody flips
 * anymore is just a way to turn the business off by typo.
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
  if (process.env.ENFORCE_ENTITLEMENTS !== 'true') {
    next();
    return;
  }

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
