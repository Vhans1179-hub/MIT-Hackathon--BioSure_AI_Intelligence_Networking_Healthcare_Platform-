/**
 * Lightweight US ZIP code → city/state/lat/lon lookup for the patient
 * self-service intake. Covers ~50 representative ZIPs across all US regions
 * (one major city per state where possible) plus the headline demo case
 * (82601 = Casper, WY). For ZIPs not in the table, falls back to the state
 * centroid using the first digit + state code.
 *
 * Good enough for a demo. Production would call a real geocoding service.
 */

export interface ZipResolved {
  city: string;
  state: string;
  country: 'US';
  lat: number;
  lon: number;
  zip: string;
  approximate: boolean;  // true when fell back to state centroid
}

interface ZipEntry {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

const ZIP_TABLE: ZipEntry[] = [
  // Headline demo case
  { zip: '82601', city: 'Casper',         state: 'WY', lat: 42.8500, lon: -106.3253 },

  // Northeast
  { zip: '02108', city: 'Boston',         state: 'MA', lat: 42.3601, lon:  -71.0589 },
  { zip: '02139', city: 'Cambridge',      state: 'MA', lat: 42.3736, lon:  -71.1097 },
  { zip: '08611', city: 'Trenton',        state: 'NJ', lat: 40.2206, lon:  -74.7597 },
  { zip: '07101', city: 'Newark',         state: 'NJ', lat: 40.7357, lon:  -74.1724 },
  { zip: '10001', city: 'New York',       state: 'NY', lat: 40.7506, lon:  -73.9971 },
  { zip: '14202', city: 'Buffalo',        state: 'NY', lat: 42.8864, lon:  -78.8784 },
  { zip: '15222', city: 'Pittsburgh',     state: 'PA', lat: 40.4406, lon:  -79.9959 },
  { zip: '19103', city: 'Philadelphia',   state: 'PA', lat: 39.9526, lon:  -75.1652 },
  { zip: '06103', city: 'Hartford',       state: 'CT', lat: 41.7637, lon:  -72.6851 },
  { zip: '04101', city: 'Portland',       state: 'ME', lat: 43.6591, lon:  -70.2568 },

  // Mid-Atlantic / Southeast
  { zip: '21202', city: 'Baltimore',      state: 'MD', lat: 39.2904, lon:  -76.6122 },
  { zip: '20001', city: 'Washington',     state: 'DC', lat: 38.9072, lon:  -77.0369 },
  { zip: '23219', city: 'Richmond',       state: 'VA', lat: 37.5407, lon:  -77.4360 },
  { zip: '28202', city: 'Charlotte',      state: 'NC', lat: 35.2271, lon:  -80.8431 },
  { zip: '27514', city: 'Chapel Hill',    state: 'NC', lat: 35.9132, lon:  -79.0558 },
  { zip: '29401', city: 'Charleston',     state: 'SC', lat: 32.7765, lon:  -79.9311 },
  { zip: '30303', city: 'Atlanta',        state: 'GA', lat: 33.7490, lon:  -84.3880 },
  { zip: '33602', city: 'Tampa',          state: 'FL', lat: 27.9506, lon:  -82.4572 },
  { zip: '33130', city: 'Miami',          state: 'FL', lat: 25.7867, lon:  -80.2110 },
  { zip: '32202', city: 'Jacksonville',   state: 'FL', lat: 30.3322, lon:  -81.6557 },
  { zip: '38103', city: 'Memphis',        state: 'TN', lat: 35.1495, lon:  -90.0490 },
  { zip: '37203', city: 'Nashville',      state: 'TN', lat: 36.1627, lon:  -86.7816 },

  // Midwest
  { zip: '60601', city: 'Chicago',        state: 'IL', lat: 41.8781, lon:  -87.6298 },
  { zip: '46202', city: 'Indianapolis',   state: 'IN', lat: 39.7684, lon:  -86.1581 },
  { zip: '48226', city: 'Detroit',        state: 'MI', lat: 42.3314, lon:  -83.0458 },
  { zip: '48104', city: 'Ann Arbor',      state: 'MI', lat: 42.2808, lon:  -83.7430 },
  { zip: '44113', city: 'Cleveland',      state: 'OH', lat: 41.4993, lon:  -81.6944 },
  { zip: '43215', city: 'Columbus',       state: 'OH', lat: 39.9612, lon:  -82.9988 },
  { zip: '53202', city: 'Milwaukee',      state: 'WI', lat: 43.0389, lon:  -87.9065 },
  { zip: '55101', city: 'Saint Paul',     state: 'MN', lat: 44.9537, lon:  -93.0900 },
  { zip: '55902', city: 'Rochester',      state: 'MN', lat: 44.0225, lon:  -92.4699 },
  { zip: '63101', city: 'Saint Louis',    state: 'MO', lat: 38.6270, lon:  -90.1994 },
  { zip: '66101', city: 'Kansas City',    state: 'KS', lat: 39.1142, lon:  -94.6275 },

  // South / Texas
  { zip: '70112', city: 'New Orleans',    state: 'LA', lat: 29.9511, lon:  -90.0715 },
  { zip: '77002', city: 'Houston',        state: 'TX', lat: 29.7604, lon:  -95.3698 },
  { zip: '75201', city: 'Dallas',         state: 'TX', lat: 32.7767, lon:  -96.7970 },
  { zip: '78701', city: 'Austin',         state: 'TX', lat: 30.2672, lon:  -97.7431 },
  { zip: '78205', city: 'San Antonio',    state: 'TX', lat: 29.4241, lon:  -98.4936 },
  { zip: '73102', city: 'Oklahoma City',  state: 'OK', lat: 35.4676, lon:  -97.5164 },
  { zip: '72201', city: 'Little Rock',    state: 'AR', lat: 34.7465, lon:  -92.2896 },

  // Mountain
  { zip: '80202', city: 'Denver',         state: 'CO', lat: 39.7392, lon: -104.9903 },
  { zip: '85001', city: 'Phoenix',        state: 'AZ', lat: 33.4484, lon: -112.0740 },
  { zip: '87501', city: 'Santa Fe',       state: 'NM', lat: 35.6870, lon: -105.9378 },
  { zip: '84101', city: 'Salt Lake City', state: 'UT', lat: 40.7608, lon: -111.8910 },
  { zip: '59601', city: 'Helena',         state: 'MT', lat: 46.5891, lon: -112.0391 },
  { zip: '83702', city: 'Boise',          state: 'ID', lat: 43.6150, lon: -116.2023 },

  // West Coast / Pacific
  { zip: '98101', city: 'Seattle',        state: 'WA', lat: 47.6062, lon: -122.3321 },
  { zip: '97201', city: 'Portland',       state: 'OR', lat: 45.5152, lon: -122.6784 },
  { zip: '94102', city: 'San Francisco',  state: 'CA', lat: 37.7749, lon: -122.4194 },
  { zip: '90012', city: 'Los Angeles',    state: 'CA', lat: 34.0522, lon: -118.2437 },
  { zip: '92101', city: 'San Diego',      state: 'CA', lat: 32.7157, lon: -117.1611 },
  { zip: '95814', city: 'Sacramento',     state: 'CA', lat: 38.5816, lon: -121.4944 },
  { zip: '89101', city: 'Las Vegas',      state: 'NV', lat: 36.1699, lon: -115.1398 },
];

const STATE_CENTROIDS: Record<string, { city: string; lat: number; lon: number }> = {
  AL: { city: 'Montgomery',     lat: 32.806671, lon:  -86.791130 },
  AK: { city: 'Anchorage',      lat: 64.0,      lon: -152.0      },
  AZ: { city: 'Phoenix',        lat: 33.729759, lon: -111.431221 },
  AR: { city: 'Little Rock',    lat: 34.969704, lon:  -92.373123 },
  CA: { city: 'Sacramento',     lat: 36.116203, lon: -119.681564 },
  CO: { city: 'Denver',         lat: 39.059811, lon: -105.311104 },
  CT: { city: 'Hartford',       lat: 41.597782, lon:  -72.755371 },
  DE: { city: 'Dover',          lat: 39.318523, lon:  -75.507141 },
  DC: { city: 'Washington',     lat: 38.897438, lon:  -77.026817 },
  FL: { city: 'Tallahassee',    lat: 27.766279, lon:  -81.686783 },
  GA: { city: 'Atlanta',        lat: 33.040619, lon:  -83.643074 },
  HI: { city: 'Honolulu',       lat: 21.094318, lon: -157.498337 },
  ID: { city: 'Boise',          lat: 44.240459, lon: -114.478828 },
  IL: { city: 'Springfield',    lat: 40.349457, lon:  -88.986137 },
  IN: { city: 'Indianapolis',   lat: 39.849426, lon:  -86.258278 },
  IA: { city: 'Des Moines',     lat: 42.011539, lon:  -93.210526 },
  KS: { city: 'Topeka',         lat: 38.526600, lon:  -96.726486 },
  KY: { city: 'Frankfort',      lat: 37.668140, lon:  -84.670067 },
  LA: { city: 'Baton Rouge',    lat: 31.169546, lon:  -91.867805 },
  ME: { city: 'Augusta',        lat: 44.693947, lon:  -69.381927 },
  MD: { city: 'Annapolis',      lat: 39.063946, lon:  -76.802101 },
  MA: { city: 'Boston',         lat: 42.230171, lon:  -71.530106 },
  MI: { city: 'Lansing',        lat: 43.326618, lon:  -84.536095 },
  MN: { city: 'Saint Paul',     lat: 45.694454, lon:  -93.900192 },
  MS: { city: 'Jackson',        lat: 32.741646, lon:  -89.678696 },
  MO: { city: 'Jefferson City', lat: 38.456085, lon:  -92.288368 },
  MT: { city: 'Helena',         lat: 46.921925, lon: -110.454353 },
  NE: { city: 'Lincoln',        lat: 41.125370, lon:  -98.268082 },
  NV: { city: 'Carson City',    lat: 38.313515, lon: -117.055374 },
  NH: { city: 'Concord',        lat: 43.452492, lon:  -71.563896 },
  NJ: { city: 'Trenton',        lat: 40.298904, lon:  -74.521011 },
  NM: { city: 'Santa Fe',       lat: 34.840515, lon: -106.248482 },
  NY: { city: 'Albany',         lat: 42.165726, lon:  -74.948051 },
  NC: { city: 'Raleigh',        lat: 35.630066, lon:  -79.806419 },
  ND: { city: 'Bismarck',       lat: 47.528912, lon: -100.480827 },
  OH: { city: 'Columbus',       lat: 40.388783, lon:  -82.764915 },
  OK: { city: 'Oklahoma City',  lat: 35.565342, lon:  -96.928917 },
  OR: { city: 'Salem',          lat: 44.572021, lon: -122.070938 },
  PA: { city: 'Harrisburg',     lat: 40.590752, lon:  -77.209755 },
  RI: { city: 'Providence',     lat: 41.680893, lon:  -71.511780 },
  SC: { city: 'Columbia',       lat: 33.856892, lon:  -80.945007 },
  SD: { city: 'Pierre',         lat: 44.299782, lon:  -99.438828 },
  TN: { city: 'Nashville',      lat: 35.747845, lon:  -86.692345 },
  TX: { city: 'Austin',         lat: 31.054487, lon:  -97.563461 },
  UT: { city: 'Salt Lake City', lat: 40.150032, lon: -111.862434 },
  VT: { city: 'Montpelier',     lat: 44.045876, lon:  -72.710686 },
  VA: { city: 'Richmond',       lat: 37.769337, lon:  -78.169968 },
  WA: { city: 'Olympia',        lat: 47.400902, lon: -121.490494 },
  WV: { city: 'Charleston',     lat: 38.491226, lon:  -80.954456 },
  WI: { city: 'Madison',        lat: 44.268543, lon:  -89.616508 },
  WY: { city: 'Cheyenne',       lat: 42.755966, lon: -107.302490 },
};

// First digit of ZIP → broadly the region/state code, used only when the
// ZIP isn't in the table and the user didn't specify a state.
const ZIP_FIRST_DIGIT_FALLBACK_STATE: Record<string, string> = {
  '0': 'MA', '1': 'NY', '2': 'VA', '3': 'FL', '4': 'OH',
  '5': 'MN', '6': 'IL', '7': 'TX', '8': 'CO', '9': 'CA',
};

const zipIndex: Map<string, ZipEntry> = new Map(ZIP_TABLE.map((e) => [e.zip, e]));

/**
 * Resolve a US ZIP code to a city/state/lat/lon. If the ZIP is in the
 * embedded table, returns an exact match (approximate=false). Otherwise
 * falls back to the state centroid (using the optional stateHint, then
 * the first-digit heuristic) and marks approximate=true.
 */
export function resolveUsZip(zip: string, stateHint?: string): ZipResolved | null {
  const cleaned = (zip || '').trim();
  if (!cleaned) return null;

  const exact = zipIndex.get(cleaned);
  if (exact) {
    return {
      zip: cleaned,
      city: exact.city,
      state: exact.state,
      country: 'US',
      lat: exact.lat,
      lon: exact.lon,
      approximate: false,
    };
  }

  // Determine state: explicit hint > first-digit heuristic
  const stateCode = (stateHint && stateHint.toUpperCase()) ||
    ZIP_FIRST_DIGIT_FALLBACK_STATE[cleaned[0]] || 'CA';
  const centroid = STATE_CENTROIDS[stateCode];
  if (!centroid) return null;

  return {
    zip: cleaned,
    city: centroid.city,
    state: stateCode,
    country: 'US',
    lat: centroid.lat,
    lon: centroid.lon,
    approximate: true,
  };
}

export const US_STATE_CODES = Object.keys(STATE_CENTROIDS).sort();
