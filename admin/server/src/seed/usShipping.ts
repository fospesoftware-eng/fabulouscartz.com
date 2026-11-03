export interface UsShippingPlace {
  state: string;
  code: string;
  city: string;
  zip: string;
  weight: number;
}

/**
 * Destinations for seeded orders. Weights mirror a small atelier's real US
 * demand curve: coastal metros carry the volume, interior states stay light and
 * a handful of states are deliberately left at zero so the map's no-data style
 * is visible.
 */
export const US_SHIPPING_PLACES: UsShippingPlace[] = [
  { state: "California", code: "CA", city: "San Francisco", zip: "94105", weight: 14 },
  { state: "Texas", code: "TX", city: "Austin", zip: "78701", weight: 10 },
  { state: "New York", code: "NY", city: "New York", zip: "10012", weight: 9 },
  { state: "Florida", code: "FL", city: "Miami", zip: "33130", weight: 8 },
  { state: "Washington", code: "WA", city: "Seattle", zip: "98101", weight: 6 },
  { state: "Illinois", code: "IL", city: "Chicago", zip: "60611", weight: 5 },
  { state: "Pennsylvania", code: "PA", city: "Philadelphia", zip: "19103", weight: 4 },
  { state: "Georgia", code: "GA", city: "Atlanta", zip: "30308", weight: 4 },
  { state: "Arizona", code: "AZ", city: "Phoenix", zip: "85004", weight: 3 },
  { state: "North Carolina", code: "NC", city: "Raleigh", zip: "27601", weight: 3 },
  { state: "Ohio", code: "OH", city: "Columbus", zip: "43215", weight: 3 },
  { state: "Michigan", code: "MI", city: "Ann Arbor", zip: "48104", weight: 3 },
  { state: "New Jersey", code: "NJ", city: "Jersey City", zip: "07302", weight: 3 },
  { state: "Virginia", code: "VA", city: "Richmond", zip: "23219", weight: 3 },
  { state: "Massachusetts", code: "MA", city: "Boston", zip: "02116", weight: 2 },
  { state: "Tennessee", code: "TN", city: "Nashville", zip: "37203", weight: 2 },
  { state: "Indiana", code: "IN", city: "Indianapolis", zip: "46204", weight: 2 },
  { state: "Missouri", code: "MO", city: "Kansas City", zip: "64108", weight: 2 },
  { state: "Maryland", code: "MD", city: "Baltimore", zip: "21230", weight: 2 },
  { state: "Colorado", code: "CO", city: "Denver", zip: "80202", weight: 2 },
  { state: "Minnesota", code: "MN", city: "Minneapolis", zip: "55403", weight: 2 },
  { state: "South Carolina", code: "SC", city: "Charleston", zip: "29401", weight: 2 },
  { state: "Alabama", code: "AL", city: "Birmingham", zip: "35203", weight: 2 },
  { state: "Oregon", code: "OR", city: "Portland", zip: "97209", weight: 2 },
  { state: "Utah", code: "UT", city: "Salt Lake City", zip: "84111", weight: 2 },
  { state: "Nevada", code: "NV", city: "Las Vegas", zip: "89109", weight: 2 },
  { state: "Kentucky", code: "KY", city: "Louisville", zip: "40202", weight: 1 },
  { state: "Oklahoma", code: "OK", city: "Tulsa", zip: "74103", weight: 1 },
  { state: "Connecticut", code: "CT", city: "New Haven", zip: "06511", weight: 1 },
  { state: "Hawaii", code: "HI", city: "Honolulu", zip: "96815", weight: 1 },
  { state: "District of Columbia", code: "DC", city: "Washington", zip: "20009", weight: 1 },
  { state: "New Mexico", code: "NM", city: "Santa Fe", zip: "87501", weight: 1 },
  { state: "Idaho", code: "ID", city: "Boise", zip: "83702", weight: 1 },
  { state: "Montana", code: "MT", city: "Missoula", zip: "59802", weight: 1 },
  { state: "Nebraska", code: "NE", city: "Omaha", zip: "68102", weight: 1 },
  { state: "Kansas", code: "KS", city: "Lawrence", zip: "66044", weight: 1 },
  { state: "Arkansas", code: "AR", city: "Fayetteville", zip: "72701", weight: 1 },
  { state: "Iowa", code: "IA", city: "Iowa City", zip: "52240", weight: 1 },
  { state: "Wisconsin", code: "WI", city: "Madison", zip: "53703", weight: 1 },
  { state: "Louisiana", code: "LA", city: "New Orleans", zip: "70115", weight: 1 },
  { state: "Mississippi", code: "MS", city: "Oxford", zip: "38655", weight: 1 },
  { state: "Maine", code: "ME", city: "Portland", zip: "04101", weight: 1 },
  { state: "New Hampshire", code: "NH", city: "Portsmouth", zip: "03801", weight: 1 },
  { state: "Alaska", code: "AK", city: "Anchorage", zip: "99503", weight: 1 },
];

/** States intentionally left without seeded orders: WY, SD, ND, VT, RI, DE, WV. */
const STREETS = ["Rose Lane", "Palm Grove", "Cedar Way", "Mercer Street", "Linden Avenue", "Bay Ridge Road"];

const TOTAL_WEIGHT = US_SHIPPING_PLACES.reduce((sum, place) => sum + place.weight, 0);

/**
 * Deterministic weighted distribution: with a coprime stride across the weight
 * space every state lands within one order of its intended share, so the seeded
 * map reads like real demand instead of random noise.
 */
export function weightedShipping(index: number): UsShippingPlace {
  let cursor = (index * 47) % TOTAL_WEIGHT;
  for (const place of US_SHIPPING_PLACES) {
    if (cursor < place.weight) return place;
    cursor -= place.weight;
  }
  return US_SHIPPING_PLACES[0];
}

export function usStreet(random: () => number): string {
  const number = Math.floor(random() * 4400) + 120;
  return `${number} ${STREETS[Math.floor(random() * STREETS.length)]}`;
}
