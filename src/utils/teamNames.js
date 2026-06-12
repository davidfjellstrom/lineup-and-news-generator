import { WC2026_TEAMS } from '../data/wc2026Teams'

// API-Football uses names that differ from our canonical wc2026Teams names.
// Keys are normalized (lowercase, '&' → 'and').
export const AF_NAME_ALIASES = {
  'korea republic': 'South Korea',
  'south korea': 'South Korea',
  "cote d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'turkey': 'Türkiye',
  'turkiye': 'Türkiye',
  'usa': 'United States',
  'united states': 'United States',
  'bosnia': 'Bosnia and Herzegovina',
  'bosnia and herzegovina': 'Bosnia and Herzegovina',
  'dr congo': 'DR Congo',
  'congo dr': 'DR Congo',
}

// Lowercase, '&' → 'and', collapse whitespace — so 'Bosnia & Herzegovina'
// and 'BOSNIA AND HERZEGOVINA' compare equal.
function normalize(name) {
  return (name || '').toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim()
}

// Resolve any team name (AF or app spelling) to a canonical comparison key.
function canonicalKey(name) {
  const norm = normalize(name)
  return normalize(AF_NAME_ALIASES[norm] || norm)
}

// True if two team names (possibly in different spellings) refer to the same team.
export function sameTeam(a, b) {
  if (!a || !b) return false
  const ka = canonicalKey(a)
  const kb = canonicalKey(b)
  return ka === kb || ka.includes(kb) || kb.includes(ka)
}

export function findTeamByName(name) {
  const lower = name.toLowerCase()
  const canonical = AF_NAME_ALIASES[normalize(name)] || name
  return (
    WC2026_TEAMS.find((t) => t.name.toUpperCase() === canonical.toUpperCase()) ||
    WC2026_TEAMS.find(
      (t) =>
        t.name.toUpperCase().includes(lower.toUpperCase()) ||
        lower.toUpperCase().includes(t.name.toUpperCase()),
    )
  )
}
