/**
 * End-to-end check: run real transcripts through the LIVE parser, then apply the
 * new gate + matcher exactly as voice.ts does, and print what would be linked.
 * Read-only — writes nothing.
 *
 *   ML_SERVICE_URL=... ML_SERVICE_API_KEY=... npx tsx scripts/verify-place-gate.ts
 */

import { parseTranscript } from '../src/services/mlService';
import { shouldResolvePlaces } from '../src/services/arrivalTrigger';
import { matchPlaceName } from '../src/services/placeNameMatch';

// The user's actual manual geofence labels.
const LABELS = ['Home', 'Ammunitions', 'Gym'].map(name => ({ name }));

const TRANSCRIPTS = [
  'I need to grab chicken, gatorade, soda, paper towels and rotisserie chicken from Costco. Also need milk, eggs and bread from Safeway.',
  'I need chicken, gatorade and soda from Costco',
  'Go to Costco today to buy chicken, Gatorade and soda',
  'Grab at least eight form pens from the ammunitions project to take home tomorrow',
  'Nan needs to pick up sewer manhole testing equipment and drop it off at the ammunitions project',
  'Cancel gym membership',
  'Xyrus to call me when he arrives in Florida',
];

async function main() {
  for (const transcript of TRANSCRIPTS) {
    console.log(`\n━━ "${transcript.slice(0, 80)}"`);
    const { atomicObjects } = await parseTranscript({
      transcript,
      userId: 'verify',
      sessionId: 'verify',
    });

    for (const obj of atomicObjects) {
      const text = obj.cleanedText || obj.rawText || '';
      const places = obj.locationHints?.places ?? [];
      const parserFlag = obj.locationHints?.geofenceCandidate;
      const gated = shouldResolvePlaces(text, places, parserFlag);

      const verdict = !places.length
        ? 'no places extracted'
        : !gated
          ? 'DROPPED (gate closed)'
          : places
              .map(p => {
                const m = matchPlaceName(p, LABELS, l => l.name);
                return m ? `"${p}" → ${m.candidate.name} (${m.reason})` : `"${p}" → geocode`;
              })
              .join('; ');

      console.log(
        `   parser_flag=${parserFlag} gate=${gated ? 'OPEN ' : 'CLOSED'} | ${text.slice(0, 58)}`
      );
      console.log(`      ${verdict}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
