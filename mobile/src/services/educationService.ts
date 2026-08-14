/**
 * Progressive education state — which teaching moments this user has seen.
 *
 * Offload never explained itself (no onboarding, no About), so this tracks the
 * few one-time moments that fix that: the first-run intro, the post-first-
 * recording explanation, and the "there's a guide now" discovery toast for
 * accounts that predate the feature.
 *
 * The load-bearing distinction is NEW SIGNUP vs EXISTING ACCOUNT. The intro and
 * the first-recording explanation are only for accounts created on this device
 * (markNewSignup() runs inside register()); an existing TestFlight user signing
 * in must never be trapped in onboarding — they get a one-time discovery toast
 * pointing at "How Offload works" instead. Every read fails CLOSED (no
 * education) for the same reason: a storage hiccup should cost a teaching
 * moment, not block the app behind a screen the user can't satisfy.
 *
 * Flags live in SecureStore like permissionService's — device-local, so they
 * MUST be cleared on sign-out/delete (AuthContext calls resetEducationState()
 * alongside resetPermissionOnboarding()) or the next account on this phone
 * inherits them.
 */

import * as SecureStore from 'expo-secure-store';
import { emitFirstRecordingSaved } from './firstRecordingBus';

const KEY_NEW_SIGNUP = 'educationNewSignup';
const KEY_INTRO_SEEN = 'educationIntroSeen';
const KEY_FIRST_RECORDING_SEEN = 'educationFirstRecordingSeen';
const KEY_GUIDE_DISCOVERED = 'educationGuideDiscovered';

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(key)) === 'true';
  } catch {
    return false;
  }
}

async function writeFlag(key: string, value: boolean): Promise<void> {
  try {
    if (value) await SecureStore.setItemAsync(key, 'true');
    else await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn(`[Education] could not persist ${key}:`, err);
  }
}

// ─── Pure gates ───────────────────────────────────────────────────────────────
// Exported separately from the storage reads so the decision rules are testable
// without a device.

export interface EducationFlags {
  isNewSignup: boolean;
  introSeen: boolean;
  firstRecordingSeen: boolean;
  guideDiscovered: boolean;
}

/** First-run intro: only for accounts created on this device, only once. */
export function introGate(f: Pick<EducationFlags, 'isNewSignup' | 'introSeen'>): boolean {
  return f.isNewSignup && !f.introSeen;
}

/** Post-first-recording explanation: same audience as the intro, only once. */
export function firstRecordingGate(
  f: Pick<EducationFlags, 'isNewSignup' | 'firstRecordingSeen'>
): boolean {
  return f.isNewSignup && !f.firstRecordingSeen;
}

/**
 * Discovery toast for accounts that predate the education feature: they never
 * saw (and must never see) the intro, so a one-time nudge toward the permanent
 * guide is the whole of their onboarding.
 */
export function guideDiscoveryGate(
  f: Pick<EducationFlags, 'isNewSignup' | 'introSeen' | 'guideDiscovered'>
): boolean {
  return !f.isNewSignup && !f.introSeen && !f.guideDiscovered;
}

// ─── Stored state ─────────────────────────────────────────────────────────────

export async function readEducationFlags(): Promise<EducationFlags> {
  const [isNewSignup, introSeen, firstRecordingSeen, guideDiscovered] = await Promise.all([
    readFlag(KEY_NEW_SIGNUP),
    readFlag(KEY_INTRO_SEEN),
    readFlag(KEY_FIRST_RECORDING_SEEN),
    readFlag(KEY_GUIDE_DISCOVERED),
  ]);
  return { isNewSignup, introSeen, firstRecordingSeen, guideDiscovered };
}

/** Call from register() so this device knows the account is genuinely new. */
export const markNewSignup = () => writeFlag(KEY_NEW_SIGNUP, true);

export const setIntroSeen = () => writeFlag(KEY_INTRO_SEEN, true);
export const setFirstRecordingEducationSeen = () => writeFlag(KEY_FIRST_RECORDING_SEEN, true);
export const setGuideDiscoveryShown = () => writeFlag(KEY_GUIDE_DISCOVERED, true);

export const shouldShowIntro = async () => introGate(await readEducationFlags());
export const shouldShowFirstRecordingEducation = async () =>
  firstRecordingGate(await readEducationFlags());
export const shouldOfferGuideDiscovery = async () => guideDiscoveryGate(await readEducationFlags());

/**
 * Called from the save pipeline after a transcript is stored. Gated here so
 * the recording hook stays education-agnostic: for anyone but a new signup who
 * hasn't seen it yet, this is a no-op.
 */
export async function maybeEmitFirstRecordingEducation(sessionId: string): Promise<void> {
  if (await shouldShowFirstRecordingEducation()) {
    console.log('[Education] first recording saved — signalling Home');
    emitFirstRecordingSaved(sessionId);
  }
}

/** Sign-out/delete teardown — see the header comment for why this must run. */
export async function resetEducationState(): Promise<void> {
  await writeFlag(KEY_NEW_SIGNUP, false);
  await writeFlag(KEY_INTRO_SEEN, false);
  await writeFlag(KEY_FIRST_RECORDING_SEEN, false);
  await writeFlag(KEY_GUIDE_DISCOVERED, false);
}
