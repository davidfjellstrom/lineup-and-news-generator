export const FORMATIONS = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '5-3-2', '3-4-3', '4-1-4-1', '3-4-2-1']

// Derive broad position from specific positionLabel set by Claude.
// Falls back to the player's existing position field if positionLabel is unknown.
const POSITION_FROM_LABEL = {
  GK: 'GK',
  LB: 'DEF', LWB: 'DEF', CB: 'DEF', RB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', ST: 'FWD', CF: 'FWD', SS: 'FWD',
}

function broadPosition(player) {
  return POSITION_FROM_LABEL[player.positionLabel] ?? player.position
}

// Broad position (GK/DEF/MID/FWD) for a specific label, or null if unknown.
export function positionFromLabel(label) {
  return POSITION_FROM_LABEL[label] ?? null
}

// Lateral rank: 0 = left touchline, 1 = right touchline (from home team's perspective).
// Used to sort players within a line so that LW/LB appear near the top of the screen
// (home team's left side) and RW/RB near the bottom.
const LATERAL_RANK = {
  GK: 0.5,
  LB: 0.08, LWB: 0.08,
  CB: 0.5,
  RB: 0.92, RWB: 0.92,
  LM: 0.15, LW: 0.15,
  CDM: 0.5, CM: 0.5, CAM: 0.5,
  RM: 0.85, RW: 0.85,
  ST: 0.5, CF: 0.5, SS: 0.5,
}

function lateralRank(player) {
  return LATERAL_RANK[player.positionLabel] ?? 0.5
}

// Groups starters into display columns based on formation.
// Returns: [[GK...], [DEF...], [MID...], ..., [FWD...]]
//
// side = 'home'  → home attacks right; LW/LB sorted to top of screen (low y)
// side = 'away'  → away attacks left;  LW/LB sorted to bottom of screen (high y)
//   (because the away team's left side is the opposite physical touchline)
export function groupIntoLines(starters, formation, side = 'home') {
  const gks = starters.filter(p => broadPosition(p) === 'GK')

  const posOrder = { DEF: 0, MID: 1, FWD: 2 }
  const outfield = starters
    .filter(p => broadPosition(p) !== 'GK')
    .sort((a, b) => {
      const diff = (posOrder[broadPosition(a)] ?? 1) - (posOrder[broadPosition(b)] ?? 1)
      return diff !== 0 ? diff : a.number - b.number
    })

  const parts = formation.split('-').map(Number)
  const lines = [gks]
  let idx = 0
  for (const count of parts) {
    lines.push(outfield.slice(idx, idx + count))
    idx += count
  }

  // Sort within each line so players appear on the correct side of the pitch.
  // Home: ascending rank (LW→top, RW→bottom).
  // Away: descending rank (RW→top, LW→bottom) because away attacks in the opposite direction.
  const dir = side === 'away' ? -1 : 1
  lines.forEach(line => line.sort((a, b) => dir * (lateralRank(a) - lateralRank(b))))

  return lines
}

// Returns an array of empty player objects matching the starter slots of a formation.
export function getEmptyStartersForFormation(formation) {
  const parts = formation.split('-').map(Number)
  const posLabels = parts.length === 3
    ? ['DEF', 'MID', 'FWD']
    : parts.length === 4
      ? ['DEF', 'MID', 'MID', 'FWD']
      : parts.map((_, i) => i === 0 ? 'DEF' : i === parts.length - 1 ? 'FWD' : 'MID')

  const players = [makeEmptyPlayer(1, 'GK')]
  let num = 2
  parts.forEach((count, li) => {
    for (let i = 0; i < count; i++) {
      players.push(makeEmptyPlayer(num++, posLabels[li] ?? 'MID'))
    }
  })
  return players
}

function makeEmptyPlayer(number, position) {
  return {
    id: crypto.randomUUID(),
    number,
    firstName: '',
    lastName: '',
    position,
    photo: '',
    clubLogo: '',
    clubName: '',
    notes: '',
    isStarter: true,
  }
}
