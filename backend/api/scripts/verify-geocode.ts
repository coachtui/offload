/**
 * Read-only: run the REAL resolver for chain stores at the user's location and
 * show which candidates clear the 0.45 geofence-confidence threshold.
 * A place below the threshold is stored but never gets a geofence — so arriving
 * there produces no notification.
 */
import { resolvePlaceNameMulti } from '../src/services/placeResolutionService';

const USER = { lat: 21.4975, lng: -158.0173 }; // user's home, from source_location
const THRESHOLD = 0.45;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function main() {
  for (const name of ['Costco', "McDonald's", 'Safeway', 'Foodland']) {
    console.log(`\n━━ ${name}`);
    const results = await resolvePlaceNameMulti(name, USER);
    if (!results.length) { console.log('   NO RESULTS'); continue; }
    for (const r of results) {
      const d = km(USER.lat, USER.lng, r.lat, r.lng).toFixed(1);
      const ok = r.confidence >= THRESHOLD;
      console.log(
        `   ${ok ? 'GEOFENCE ' : 'no-fence '} conf=${r.confidence} ${d}km  ${r.normalizedName} [${r.category}]`
      );
    }
    await new Promise(r => setTimeout(r, 1200)); // Nominatim courtesy
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
