import { sameTeam } from '../utils/teamNames'
import { positionFromLabel } from '../utils/formations'

const VALID_POSITIONS = ['GK', 'DEF', 'MID', 'FWD']

// Maps a backend player object to the app's player shape.
export function toPlayer(p, isStarter) {
  return {
    id: crypto.randomUUID(),
    number: p.number ?? '',
    firstName: (p.firstName ?? '').toUpperCase(),
    lastName: (p.lastName ?? '').toUpperCase(),
    position: VALID_POSITIONS.includes(p.position) ? p.position : 'MID',
    positionLabel: p.positionLabel ?? '',
    photo: p.photo ?? '',
    clubLogo: p.clubLogoUrl ?? '',
    clubName: p.clubName ?? '',
    notes: '',
    isStarter,
    age: p.age ?? null,
    height: p.height ?? null,
    foot: p.foot ?? null,
    caps: p.caps ?? null,
    goals: p.goals ?? null,
    marketValue: p.marketValue ?? null,
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// Find the WC 2026 fixture where the two teams meet. Tries the fixture list of
// either team, since API-Football may not recognize one of our team spellings.
export async function resolveFixture(homeName, awayName) {
  let lastError = null
  for (const name of [homeName, awayName]) {
    if (!name?.trim()) continue
    let data
    try {
      data = await fetchJson(`/api/fixtures?team=${encodeURIComponent(name)}`)
    } catch (err) {
      lastError = err
      continue
    }
    const candidates = (data.fixtures || []).filter(
      (f) =>
        (sameTeam(f.home, homeName) && sameTeam(f.away, awayName)) ||
        (sameTeam(f.home, awayName) && sameTeam(f.away, homeName)),
    )
    if (candidates.length > 0) {
      // Group + knockout rematches are possible — pick the fixture closest in time.
      const now = Date.now()
      candidates.sort(
        (a, b) => Math.abs(new Date(a.date) - now) - Math.abs(new Date(b.date) - now),
      )
      return candidates[0]
    }
  }
  throw new Error(
    lastError
      ? `Kunde inte hämta matcher: ${lastError.message}`
      : `Hittade ingen VM-match mellan ${homeName} och ${awayName}.`,
  )
}

// Merge a confirmed lineup into an existing team. Players already in the squad
// keep their id, notes, photos and stats — so commentator prep and custom pitch
// positions survive the switch. Identity is matched on NAME, never on shirt
// number alone: estimated squads can assign the same number to a different
// player, and merging by number then shows the wrong person in the XI.
export function mergeConfirmedTeam(team, data) {
  const starters = data.starters ?? []
  if (starters.length === 0) throw new Error('Inga spelare returnerades')
  const confirmed = [
    ...starters.map((p) => ({ ...p, isStarter: true })),
    ...(data.substitutes ?? []).map((p) => ({ ...p, isStarter: false })),
  ]

  // Comparison key: uppercase, diacritics stripped ('BAŠIĆ' matches 'BASIC').
  const norm = (s) =>
    (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
  // Only real players (with a name) are merge candidates — empty formation
  // placeholders carry no identity.
  const remaining = team.players.filter((p) => norm(p.lastName))

  const takeExisting = (cp) => {
    const wanted = norm(cp.lastName)
    if (!wanted) return null
    let candidates = remaining.filter((p) => norm(p.lastName) === wanted)
    if (candidates.length === 0) {
      // Spelling variants like 'DE FOUGEROLLES' vs 'FOUGEROLLES'
      candidates = remaining.filter((p) => {
        const have = norm(p.lastName)
        return have.length >= 4 && wanted.length >= 4 && (have.includes(wanted) || wanted.includes(have))
      })
    }
    if (candidates.length === 0) return null
    // Same surname twice in a squad: prefer same number, then same first initial.
    const pick =
      candidates.find((p) => cp.number && String(p.number) === String(cp.number)) ??
      candidates.find((p) => norm(p.firstName)[0] === norm(cp.firstName)[0]) ??
      candidates[0]
    remaining.splice(remaining.indexOf(pick), 1)
    return pick
  }

  const players = confirmed.map((cp) => {
    const existing = takeExisting(cp)
    if (!existing) return toPlayer(cp, cp.isStarter)
    // The matchday team sheet is the truth for number and position. Keep the
    // richer pre-match label (RW, CDM, …) only when it agrees with the confirmed
    // role, so formation lines group correctly (e.g. estimated RW playing RM).
    const position = VALID_POSITIONS.includes(cp.position) ? cp.position : existing.position
    const labelAgrees = positionFromLabel(existing.positionLabel) === position
    return {
      ...existing,
      number: cp.number || existing.number,
      firstName: existing.firstName || (cp.firstName ?? '').toUpperCase(),
      lastName: existing.lastName || (cp.lastName ?? '').toUpperCase(),
      photo: existing.photo || cp.photo || '',
      position,
      positionLabel: labelAgrees ? existing.positionLabel : '',
      isStarter: cp.isStarter,
    }
  })

  // Squad players not on the team sheet stay on the bench so their notes survive.
  players.push(...remaining.map((p) => ({ ...p, isStarter: false })))

  return {
    ...team,
    ...(data.coach ? { coach: data.coach } : {}),
    ...(data.formation ? { formation: data.formation } : {}),
    players,
  }
}

async function fetchConfirmedTeam(teamName, formation, fixtureId) {
  const params = new URLSearchParams({
    team: teamName,
    formation: formation || '4-3-3',
    mode: 'match',
    fixture_id: fixtureId,
  })
  return fetchJson(`/api/lineup?${params}`)
}

// Resolve the fixture for the current match and load both confirmed lineups.
// Returns updated team objects without mutating match — the caller applies them.
export async function loadConfirmedMatch(match) {
  const homeName = match.homeTeam.name
  const awayName = match.awayTeam.name
  if (!homeName.trim() || !awayName.trim()) {
    throw new Error('Välj båda lagen i Setup först.')
  }

  // Reuse a fixture picked in Setup if it still matches the chosen teams.
  const stored = match.fixture
  const storedValid =
    stored &&
    ((sameTeam(stored.home, homeName) && sameTeam(stored.away, awayName)) ||
      (sameTeam(stored.home, awayName) && sameTeam(stored.away, homeName)))
  const fixture = storedValid ? stored : await resolveFixture(homeName, awayName)

  // Pass API-Football's exact spelling so the backend picks the right side.
  const afNameFor = (appName) =>
    sameTeam(fixture.home, appName) ? fixture.home : fixture.away

  const [homeData, awayData] = await Promise.all([
    fetchConfirmedTeam(afNameFor(homeName), match.homeTeam.formation, fixture.fixtureId),
    fetchConfirmedTeam(afNameFor(awayName), match.awayTeam.formation, fixture.fixtureId),
  ])

  return {
    fixture,
    homeTeam: mergeConfirmedTeam(match.homeTeam, homeData),
    awayTeam: mergeConfirmedTeam(match.awayTeam, awayData),
  }
}
