/**
 * Shared arrival-notification ledger.
 *
 * Both arrival paths — the background geofence task and the foreground
 * proximity check — fire local notifications for the same physical event, and
 * each used to keep its own private cooldown, which is why opening the app at a
 * place could ping twice within seconds. This file is the single record of
 * "this region was notified at time T", persisted so the background task's JS
 * context and the app's share it.
 */

import { File, Paths } from 'expo-file-system';

const LEDGER_FILE_NAME = 'arrival_ledger.json';

/** One notification per region per this window, across every path. */
export const ARRIVAL_COOLDOWN_MS = 30 * 60 * 1000;

// Entries older than this are dropped on write to keep the file from growing.
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

type Ledger = Record<string, number>;

async function readLedger(): Promise<Ledger> {
  try {
    const file = new File(Paths.document, LEDGER_FILE_NAME);
    if (!file.exists) return {};
    return JSON.parse(await file.text()) as Ledger;
  } catch (e) {
    console.warn('[arrivalLedger] read failed:', e);
    return {};
  }
}

function writeLedger(ledger: Ledger): void {
  try {
    new File(Paths.document, LEDGER_FILE_NAME).write(JSON.stringify(ledger));
  } catch (e) {
    console.warn('[arrivalLedger] write failed:', e);
  }
}

/** True if any path has notified for this region within the cooldown window. */
export async function wasRecentlyNotified(regionId: string): Promise<boolean> {
  const ledger = await readLedger();
  const last = ledger[regionId];
  return typeof last === 'number' && Date.now() - last < ARRIVAL_COOLDOWN_MS;
}

/**
 * Record that a notification was actually presented for this region. Call at
 * the moment of presentation, not at the moment of deciding — a suppressed or
 * failed notification must not start a cooldown.
 */
export async function markNotified(regionId: string): Promise<void> {
  const now = Date.now();
  const ledger = await readLedger();
  for (const [id, ts] of Object.entries(ledger)) {
    if (now - ts > PRUNE_AFTER_MS) delete ledger[id];
  }
  ledger[regionId] = now;
  writeLedger(ledger);
}
