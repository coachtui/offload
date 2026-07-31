import {
  textHasArrivalTrigger,
  isPlaceErrand,
  shouldResolvePlaces,
  extractPlacesFromText,
} from '../../services/arrivalTrigger';

describe('textHasArrivalTrigger', () => {
  it('matches explicit arrival phrasing', () => {
    expect(textHasArrivalTrigger('Remind me to grab milk at Safeway')).toBe(true);
    expect(textHasArrivalTrigger('Look for a poké bowl when I get to Foodland')).toBe(true);
    expect(textHasArrivalTrigger('Grab milk at Costco')).toBe(true);
  });

  // Documents known gaps rather than widening the pattern. A bare destination
  // ("get home", no to/at) is not caught, in either person. Loosening the
  // subject would also swallow "when you get a chance", and dropping the
  // to/at requirement would swallow "when I get around to it". The parser
  // flags both of these itself (verified against production notes), so this
  // net does not need to.
  it('misses bare-destination arrival phrasing (parser covers it)', () => {
    expect(textHasArrivalTrigger('Do laundry when you get home')).toBe(false);
    expect(textHasArrivalTrigger('Do laundry when I get home')).toBe(false);
  });

  it('does not match ordinary notes', () => {
    expect(textHasArrivalTrigger('Cancel gym membership')).toBe(false);
    expect(textHasArrivalTrigger('Chris prefers texts over emails')).toBe(false);
  });
});

describe('isPlaceErrand', () => {
  // The reported bug: rattling a list is the natural phrasing and the parser
  // returns geofence_candidate=false for it, so the place was never resolved.
  it('matches an errand naming its destination', () => {
    expect(
      isPlaceErrand('Buy chicken, gatorade, soda and paper towels from Costco', ['Costco'])
    ).toBe(true);
    expect(isPlaceErrand('I need milk, eggs and bread from Safeway', ['Safeway'])).toBe(true);
    expect(isPlaceErrand('Grab fries at McDonald\'s', ["McDonald's"])).toBe(true);
  });

  it('matches drop-off and pick-up errands at a jobsite', () => {
    expect(
      isPlaceErrand(
        'Nan needs to pick up sewer manhole testing equipment and drop it off at the ammunitions project',
        ['ammunitions project']
      )
    ).toBe(true);
  });

  it('does not fire without an errand verb', () => {
    expect(isPlaceErrand('Cancel gym membership', ['gym'])).toBe(false);
    expect(
      isPlaceErrand('Investigate why the Offload app did not capture the location for Costco', ['Costco'])
    ).toBe(false);
    expect(isPlaceErrand('Xyrus to call me when he arrives in Florida', ['Florida'])).toBe(false);
  });

  // "need" is an errand verb, but the place must be named as a destination —
  // otherwise app-feature notes that merely mention place names get swept in.
  it('does not fire when the place is not a destination', () => {
    expect(
      isPlaceErrand('Need a feature to add places like homework, dad\'s house in the app', [
        'homework',
        "dad's house",
      ])
    ).toBe(false);
  });

  it('requires the place to directly follow the preposition', () => {
    expect(isPlaceErrand('I need to call the Florida office', ['Florida'])).toBe(false);
  });

  it('is inert with no places', () => {
    expect(isPlaceErrand('Buy milk from the store', [])).toBe(false);
  });

  it('handles regex-special characters in place names', () => {
    expect(isPlaceErrand('Grab fries at Joe (the) Diner', ['Joe (the) Diner'])).toBe(true);
  });
});

describe('shouldResolvePlaces', () => {
  it('honours the parser flag when set', () => {
    expect(shouldResolvePlaces('Go to Costco to buy soda', ['Costco'], true)).toBe(true);
  });

  it('rescues an errand the parser flagged false', () => {
    expect(
      shouldResolvePlaces('I need chicken, gatorade and soda from Costco', ['Costco'], false)
    ).toBe(true);
  });

  it('still declines non-errands the parser flagged false', () => {
    expect(shouldResolvePlaces('Cancel gym membership', ['gym'], false)).toBe(false);
  });
});

describe('extractPlacesFromText', () => {
  it('pulls known store names for the ML-down fallback', () => {
    expect(extractPlacesFromText('Grab milk at Costco and stuff at Walmart')).toEqual([
      'Costco',
      'Walmart',
    ]);
  });
});
