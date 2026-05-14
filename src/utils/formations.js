export const FORMATIONS = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '5-3-2', '3-4-3', '4-1-4-1', '3-4-2-1']

// Groups starters into display columns based on formation.
// Returns: [[GK...], [DEF...], [MID...], ..., [FWD...]]
export function groupIntoLines(starters, formation) {
  const gks = starters.filter(p => p.position === 'GK')

  const posOrder = { DEF: 0, MID: 1, FWD: 2 }
  const outfield = starters
    .filter(p => p.position !== 'GK')
    .sort((a, b) => {
      const diff = (posOrder[a.position] ?? 1) - (posOrder[b.position] ?? 1)
      return diff !== 0 ? diff : a.number - b.number
    })

  const parts = formation.split('-').map(Number)
  const lines = [gks]
  let idx = 0
  for (const count of parts) {
    lines.push(outfield.slice(idx, idx + count))
    idx += count
  }
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
