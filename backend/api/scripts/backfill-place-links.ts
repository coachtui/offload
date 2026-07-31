/**
 * Backfill: attach previously-dropped notes to the user's labeled geofences.
 *
 * Notes that named a place were silently dropped when the spoken phrase didn't
 * EXACTLY equal a geofence label ("the ammunitions project" vs "Ammunitions").
 * This re-runs the (now looser) matcher over those notes.
 *
 * Deliberately does NOT geocode. Running Nominatim over months-old notes would
 * mint a pile of new inferred places/geofences for stale errands (four separate
 * McDonald's notes → up to twelve geofences), blow the 15-geofence budget and
 * register OS regions the user never asked for. Only links to places the user
 * actually labeled — which is the part that was broken.
 *
 * Usage:
 *   npx tsx scripts/backfill-place-links.ts           # dry run, prints plan
 *   npx tsx scripts/backfill-place-links.ts --apply   # writes links
 */

import { queryMany } from '../src/db/queries';
import { GeofenceModel } from '../src/models/Geofence';
import { matchPlaceName } from '../src/services/placeNameMatch';
import { shouldResolvePlaces } from '../src/services/arrivalTrigger';

const APPLY = process.argv.includes('--apply');

interface Row {
  id: string;
  user_id: string;
  location_places: string[];
  location_geofence_candidate: boolean;
  content: string;
  created_at: Date;
}

async function main() {
  // Pull every unlinked note that named a place; the gate is applied in JS below
  // using the same rules as voice.ts, so notes the parser wrongly flagged false
  // ("...drop it off at the ammunitions project") are reconsidered.
  const rows = await queryMany<Row>(
    `SELECT ao.id, ao.user_id, ao.location_places, ao.location_geofence_candidate,
            COALESCE(ao.cleaned_text, ao.content) AS content, ao.created_at
     FROM hub.atomic_objects ao
     WHERE ao.deleted_at IS NULL
       AND ao.state IN ('open','active')
       AND array_length(ao.location_places, 1) > 0
       AND NOT EXISTS (SELECT 1 FROM hub.geofence_objects g WHERE g.object_id = ao.id)
       AND NOT EXISTS (SELECT 1 FROM hub.object_place_links o WHERE o.object_id = ao.id)
     ORDER BY ao.created_at`
  );

  console.log(`${rows.length} unlinked note(s) naming a place to consider\n`);

  const geofencesByUser = new Map<string, GeofenceModel[]>();
  let linked = 0;
  let skipped = 0;

  for (const row of rows) {
    // Same gate as the live pipeline — a note like "Cancel gym membership" must
    // not become a Gym arrival reminder just because it says "gym".
    if (!shouldResolvePlaces(row.content, row.location_places, row.location_geofence_candidate)) {
      skipped++;
      console.log(
        `gate  [${row.location_places.join(', ')}] — not an arrival/errand note\n` +
        `      ${row.created_at.toISOString().slice(0, 10)}  ${row.content.slice(0, 70)}`
      );
      continue;
    }

    if (!geofencesByUser.has(row.user_id)) {
      const all = await GeofenceModel.findByUserId(row.user_id);
      geofencesByUser.set(row.user_id, all.filter(g => g.createdBy === 'manual'));
    }
    const manual = geofencesByUser.get(row.user_id)!;

    let matchedAny = false;
    for (const phrase of row.location_places) {
      const match = matchPlaceName(phrase, manual, g => g.name);
      if (!match) continue;

      matchedAny = true;
      linked++;
      console.log(
        `LINK  "${phrase}" → ${match.candidate.name} (${match.reason})\n` +
        `      ${row.created_at.toISOString().slice(0, 10)}  ${row.content.slice(0, 70)}`
      );

      if (APPLY) {
        await GeofenceModel.addLinkedObject(match.candidate.id, row.id);
      }
    }

    if (!matchedAny) {
      skipped++;
      console.log(
        `skip  [${row.location_places.join(', ')}] — no labeled geofence\n` +
        `      ${row.created_at.toISOString().slice(0, 10)}  ${row.content.slice(0, 70)}`
      );
    }
  }

  console.log(
    `\n${linked} link(s) ${APPLY ? 'written' : 'to write'}, ${skipped} note(s) with no labeled match.`
  );
  if (!APPLY) console.log('Dry run — re-run with --apply to write.');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
