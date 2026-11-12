import airportReference from './airport-reference.json';

export type Region = { code: string; name: string; fips: string };
export type Airport = {
  iata: string;
  name: string;
  state: string;
  tier: 'Major' | 'Secondary' | 'Regional';
  lat?: number;
  lon?: number;
  scheduled?: boolean;
  icao?: string;
};
export type Area = { code: string; name: string };
export type Manager = {
  id: string;
  name: string;
  email: string;
  phone: string;
  homeAirport: string;
  trainer: string;
  cadence: string;
  focus: string;
};
export type Assignment = {
  id: string;
  managerId: string;
  stateCode: string;
  areaType: 'state' | 'county' | 'place';
  areaCode: string;
  areaName: string;
  role: 'Primary' | 'Shared' | 'Support';
};
export type Visit = {
  id: string;
  managerId: string;
  stateCode: string;
  date: string;
  airport: string;
  objective: string;
  status: string;
};
export const STATES: Region[] = [
  ['AL', 'Alabama', '01'],
  ['AK', 'Alaska', '02'],
  ['AZ', 'Arizona', '04'],
  ['AR', 'Arkansas', '05'],
  ['CA', 'California', '06'],
  ['CO', 'Colorado', '08'],
  ['CT', 'Connecticut', '09'],
  ['DE', 'Delaware', '10'],
  ['DC', 'District of Columbia', '11'],
  ['FL', 'Florida', '12'],
  ['GA', 'Georgia', '13'],
  ['HI', 'Hawaii', '15'],
  ['ID', 'Idaho', '16'],
  ['IL', 'Illinois', '17'],
  ['IN', 'Indiana', '18'],
  ['IA', 'Iowa', '19'],
  ['KS', 'Kansas', '20'],
  ['KY', 'Kentucky', '21'],
  ['LA', 'Louisiana', '22'],
  ['ME', 'Maine', '23'],
  ['MD', 'Maryland', '24'],
  ['MA', 'Massachusetts', '25'],
  ['MI', 'Michigan', '26'],
  ['MN', 'Minnesota', '27'],
  ['MS', 'Mississippi', '28'],
  ['MO', 'Missouri', '29'],
  ['MT', 'Montana', '30'],
  ['NE', 'Nebraska', '31'],
  ['NV', 'Nevada', '32'],
  ['NH', 'New Hampshire', '33'],
  ['NJ', 'New Jersey', '34'],
  ['NM', 'New Mexico', '35'],
  ['NY', 'New York', '36'],
  ['NC', 'North Carolina', '37'],
  ['ND', 'North Dakota', '38'],
  ['OH', 'Ohio', '39'],
  ['OK', 'Oklahoma', '40'],
  ['OR', 'Oregon', '41'],
  ['PA', 'Pennsylvania', '42'],
  ['RI', 'Rhode Island', '44'],
  ['SC', 'South Carolina', '45'],
  ['SD', 'South Dakota', '46'],
  ['TN', 'Tennessee', '47'],
  ['TX', 'Texas', '48'],
  ['UT', 'Utah', '49'],
  ['VT', 'Vermont', '50'],
  ['VA', 'Virginia', '51'],
  ['WA', 'Washington', '53'],
  ['WV', 'West Virginia', '54'],
  ['WI', 'Wisconsin', '55'],
  ['WY', 'Wyoming', '56'],
].map(([code, name, fips]) => ({ code, name, fips }));
export const STATE_BY_CODE: Record<string, Region> = Object.fromEntries(
  STATES.map(s => [s.code, s])
);
export const STATE_BY_FIPS: Record<string, Region> = Object.fromEntries(
  STATES.map(s => [s.fips, s])
);
const starterRows = [
  ['AL', 'BHM', 'Birmingham'],
  ['AL', 'HSV', 'Huntsville'],
  ['AK', 'ANC', 'Anchorage'],
  ['AK', 'FAI', 'Fairbanks'],
  ['AZ', 'PHX', 'Phoenix Sky Harbor'],
  ['AZ', 'TUS', 'Tucson'],
  ['AR', 'LIT', 'Little Rock'],
  ['AR', 'XNA', 'Northwest Arkansas'],
  ['CA', 'LAX', 'Los Angeles'],
  ['CA', 'SFO', 'San Francisco'],
  ['CA', 'SAN', 'San Diego'],
  ['CA', 'SMF', 'Sacramento'],
  ['CO', 'DEN', 'Denver'],
  ['CO', 'COS', 'Colorado Springs'],
  ['CT', 'BDL', 'Bradley International'],
  ['DE', 'ILG', 'Wilmington'],
  ['FL', 'MIA', 'Miami'],
  ['FL', 'MCO', 'Orlando'],
  ['FL', 'TPA', 'Tampa'],
  ['FL', 'FLL', 'Fort Lauderdale'],
  ['FL', 'JAX', 'Jacksonville'],
  ['FL', 'MLB', 'Melbourne Orlando'],
  ['GA', 'ATL', 'Hartsfield-Jackson Atlanta'],
  ['GA', 'SAV', 'Savannah'],
  ['HI', 'HNL', 'Honolulu'],
  ['HI', 'OGG', 'Kahului'],
  ['ID', 'BOI', 'Boise'],
  ['ID', 'SUN', 'Friedman Memorial'],
  ['IL', 'ORD', 'Chicago O Hare'],
  ['IL', 'MDW', 'Chicago Midway'],
  ['IN', 'IND', 'Indianapolis'],
  ['IN', 'FWA', 'Fort Wayne'],
  ['IA', 'DSM', 'Des Moines'],
  ['IA', 'CID', 'Eastern Iowa'],
  ['KS', 'ICT', 'Wichita'],
  ['KS', 'MHK', 'Manhattan'],
  ['KY', 'CVG', 'Cincinnati / Northern Kentucky'],
  ['KY', 'SDF', 'Louisville'],
  ['LA', 'MSY', 'New Orleans'],
  ['LA', 'BTR', 'Baton Rouge'],
  ['ME', 'PWM', 'Portland International Jetport'],
  ['ME', 'BGR', 'Bangor'],
  ['MD', 'BWI', 'Baltimore / Washington'],
  ['MA', 'BOS', 'Boston Logan'],
  ['MA', 'ORH', 'Worcester'],
  ['MI', 'DTW', 'Detroit Metro'],
  ['MI', 'GRR', 'Gerald R Ford'],
  ['MN', 'MSP', 'Minneapolis / St Paul'],
  ['MN', 'RST', 'Rochester'],
  ['MS', 'JAN', 'Jackson-Medgar Wiley Evers'],
  ['MS', 'GPT', 'Gulfport / Biloxi'],
  ['MO', 'STL', 'St Louis Lambert'],
  ['MO', 'MCI', 'Kansas City'],
  ['MT', 'BZN', 'Bozeman Yellowstone'],
  ['MT', 'BIL', 'Billings Logan'],
  ['NE', 'OMA', 'Eppley Airfield'],
  ['NE', 'LNK', 'Lincoln'],
  ['NV', 'LAS', 'Harry Reid'],
  ['NV', 'RNO', 'Reno-Tahoe'],
  ['NH', 'MHT', 'Manchester-Boston'],
  ['NJ', 'EWR', 'Newark Liberty'],
  ['NM', 'ABQ', 'Albuquerque Sunport'],
  ['NM', 'SAF', 'Santa Fe'],
  ['NY', 'JFK', 'John F Kennedy'],
  ['NY', 'LGA', 'LaGuardia'],
  ['NY', 'BUF', 'Buffalo Niagara'],
  ['NC', 'CLT', 'Charlotte Douglas'],
  ['NC', 'RDU', 'Raleigh Durham'],
  ['ND', 'FAR', 'Hector International'],
  ['ND', 'BIS', 'Bismarck'],
  ['OH', 'CLE', 'Cleveland Hopkins'],
  ['OH', 'CMH', 'John Glenn Columbus'],
  ['OK', 'OKC', 'Will Rogers'],
  ['OK', 'TUL', 'Tulsa'],
  ['OR', 'PDX', 'Portland'],
  ['OR', 'EUG', 'Eugene'],
  ['PA', 'PHL', 'Philadelphia'],
  ['PA', 'PIT', 'Pittsburgh'],
  ['RI', 'PVD', 'Rhode Island T F Green'],
  ['SC', 'CHS', 'Charleston'],
  ['SC', 'GSP', 'Greenville Spartanburg'],
  ['SD', 'FSD', 'Sioux Falls'],
  ['SD', 'RAP', 'Rapid City'],
  ['TN', 'BNA', 'Nashville'],
  ['TN', 'MEM', 'Memphis'],
  ['TX', 'DFW', 'Dallas Fort Worth'],
  ['TX', 'IAH', 'George Bush Intercontinental'],
  ['TX', 'AUS', 'Austin Bergstrom'],
  ['TX', 'SAT', 'San Antonio'],
  ['UT', 'SLC', 'Salt Lake City'],
  ['UT', 'SGU', 'St George'],
  ['VT', 'BTV', 'Burlington'],
  ['VA', 'IAD', 'Dulles'],
  ['VA', 'DCA', 'Reagan National'],
  ['VA', 'RIC', 'Richmond'],
  ['WA', 'SEA', 'Seattle Tacoma'],
  ['WA', 'GEG', 'Spokane'],
  ['WV', 'CRW', 'West Virginia International Yeager'],
  ['WI', 'MKE', 'Milwaukee Mitchell'],
  ['WI', 'MSN', 'Dane County Regional'],
  ['WY', 'JAC', 'Jackson Hole'],
  ['WY', 'CPR', 'Casper Natrona'],
];
// Dated OurAirports snapshot; classification follows the published airport type.
export const STARTER_AIRPORTS: Airport[] = starterRows.map((r):Airport => {
  const reference=airportReference[r[1] as keyof typeof airportReference];
  return {state:r[0],iata:r[1],name:r[2],...reference,
    tier:reference.type==='large_airport'?'Major':reference.type==='medium_airport'?'Secondary':'Regional'};
});
