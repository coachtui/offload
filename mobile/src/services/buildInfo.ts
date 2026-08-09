import * as Updates from 'expo-updates';

/**
 * What JS bundle this app is actually running right now.
 *
 * `eas update:list` says what was published; it cannot say what a given phone
 * launched. When an OTA fix appears not to have taken effect, the first thing
 * worth ruling out is that the device is still on the bundle baked into the
 * .ipa — this is the only way to tell from the phone itself.
 */
export interface BuildInfo {
  /** One line, safe to show in the UI. */
  label: string;
  /** True when running the bundle shipped inside the binary — no OTA applied. */
  isEmbedded: boolean;
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : 'unknown';
}

function publishedAt(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getBuildInfo(): BuildInfo {
  const version = Updates.runtimeVersion ?? '—';

  // Dev client and simulator builds serve JS from Metro, so no update identity
  // exists to report and none is expected.
  if (!Updates.isEnabled) {
    return { label: `v${version} · development bundle`, isEmbedded: true };
  }

  // `??` is not enough: a build with no channel configured reports an empty
  // string, not null, which rendered as "v1.1.0 · · embedded bundle".
  const channel = Updates.channel || 'no channel';

  if (Updates.isEmbeddedLaunch) {
    return {
      label: `v${version} · ${channel} · embedded bundle, no update applied`,
      isEmbedded: true,
    };
  }

  const when = publishedAt(Updates.createdAt);
  return {
    label: `v${version} · ${channel} · update ${shortId(Updates.updateId)}${when ? ` · ${when}` : ''}`,
    isEmbedded: false,
  };
}
