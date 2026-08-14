/**
 * Education state — the rules that keep onboarding from ever trapping anyone.
 *
 * The properties that matter, in order of the damage their loss would do:
 *   1. An existing account (login, not register) never sees the intro or the
 *      first-recording explanation — only the one-time discovery toast.
 *   2. Every moment is one-time: seen ⇒ never again, across restarts.
 *   3. Sign-out clears everything, so the next account on the phone starts over.
 *   4. Storage failures fail closed (no education), never open (no gate).
 */

import { __resetMockStore } from './mocks/secureStore';
import {
  introGate,
  firstRecordingGate,
  guideDiscoveryGate,
  readEducationFlags,
  markNewSignup,
  setIntroSeen,
  setFirstRecordingEducationSeen,
  setGuideDiscoveryShown,
  shouldShowIntro,
  shouldShowFirstRecordingEducation,
  shouldOfferGuideDiscovery,
  maybeEmitFirstRecordingEducation,
  resetEducationState,
} from '../educationService';
import { subscribeFirstRecording, emitFirstRecordingSaved } from '../firstRecordingBus';

const flushBus = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  __resetMockStore();
});

describe('pure gates', () => {
  it('intro only for unseen new signups', () => {
    expect(introGate({ isNewSignup: true, introSeen: false })).toBe(true);
    expect(introGate({ isNewSignup: true, introSeen: true })).toBe(false);
    expect(introGate({ isNewSignup: false, introSeen: false })).toBe(false);
  });

  it('first-recording explanation only for unseen new signups', () => {
    expect(firstRecordingGate({ isNewSignup: true, firstRecordingSeen: false })).toBe(true);
    expect(firstRecordingGate({ isNewSignup: true, firstRecordingSeen: true })).toBe(false);
    expect(firstRecordingGate({ isNewSignup: false, firstRecordingSeen: false })).toBe(false);
  });

  it('guide discovery only for existing accounts that never saw the intro', () => {
    const existing = { isNewSignup: false, introSeen: false, guideDiscovered: false };
    expect(guideDiscoveryGate(existing)).toBe(true);
    expect(guideDiscoveryGate({ ...existing, guideDiscovered: true })).toBe(false);
    // A new signup is handled by the intro, not the toast.
    expect(guideDiscoveryGate({ ...existing, isNewSignup: true })).toBe(false);
    // Belt and braces: an account that somehow saw the intro needs no discovery.
    expect(guideDiscoveryGate({ ...existing, introSeen: true })).toBe(false);
  });
});

describe('new signup lifecycle', () => {
  it('register → intro once → first recording once', async () => {
    await markNewSignup();

    expect(await shouldShowIntro()).toBe(true);
    expect(await shouldOfferGuideDiscovery()).toBe(false);

    await setIntroSeen();
    expect(await shouldShowIntro()).toBe(false);
    // Completing the intro must not re-open the existing-user toast path.
    expect(await shouldOfferGuideDiscovery()).toBe(false);

    expect(await shouldShowFirstRecordingEducation()).toBe(true);
    await setFirstRecordingEducationSeen();
    expect(await shouldShowFirstRecordingEducation()).toBe(false);
  });

  it('flags persist across a simulated restart (fresh reads of the same store)', async () => {
    await markNewSignup();
    await setIntroSeen();
    const flags = await readEducationFlags();
    expect(flags).toEqual({
      isNewSignup: true,
      introSeen: true,
      firstRecordingSeen: false,
      guideDiscovered: false,
    });
  });
});

describe('existing account (login, not register)', () => {
  it('gets no intro and no first-recording education, only one discovery offer', async () => {
    // Nothing was ever marked — the login path writes no education flags.
    expect(await shouldShowIntro()).toBe(false);
    expect(await shouldShowFirstRecordingEducation()).toBe(false);

    expect(await shouldOfferGuideDiscovery()).toBe(true);
    await setGuideDiscoveryShown();
    expect(await shouldOfferGuideDiscovery()).toBe(false);
  });
});

describe('maybeEmitFirstRecordingEducation', () => {
  it('signals Home for a new signup, exactly while the gate is open', async () => {
    await markNewSignup();
    const received: string[] = [];
    const unsubscribe = subscribeFirstRecording((sessionId) => received.push(sessionId));

    await maybeEmitFirstRecordingEducation('session-1');
    await flushBus();
    expect(received).toEqual(['session-1']);

    await setFirstRecordingEducationSeen();
    await maybeEmitFirstRecordingEducation('session-2');
    await flushBus();
    expect(received).toEqual(['session-1']);
    unsubscribe();
  });

  it('stays silent for existing accounts', async () => {
    const received: string[] = [];
    const unsubscribe = subscribeFirstRecording((sessionId) => received.push(sessionId));
    await maybeEmitFirstRecordingEducation('session-1');
    await flushBus();
    expect(received).toEqual([]);
    unsubscribe();
  });

  it('buffers a signal emitted before Home subscribes', async () => {
    emitFirstRecordingSaved('early-session');
    const received: string[] = [];
    const unsubscribe = subscribeFirstRecording((sessionId) => received.push(sessionId));
    await flushBus();
    expect(received).toEqual(['early-session']);
    unsubscribe();
  });
});

describe('sign-out teardown', () => {
  it('resetEducationState clears every flag', async () => {
    await markNewSignup();
    await setIntroSeen();
    await setFirstRecordingEducationSeen();
    await setGuideDiscoveryShown();

    await resetEducationState();

    expect(await readEducationFlags()).toEqual({
      isNewSignup: false,
      introSeen: false,
      firstRecordingSeen: false,
      guideDiscovered: false,
    });
    // The next account on this phone is an "existing account" until it
    // registers here — so it gets the toast path, not the intro.
    expect(await shouldShowIntro()).toBe(false);
    expect(await shouldOfferGuideDiscovery()).toBe(true);
  });
});
