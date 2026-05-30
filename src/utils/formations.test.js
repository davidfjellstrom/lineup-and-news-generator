import { describe, it, expect } from 'vitest'
import { groupIntoLines, getEmptyStartersForFormation } from './formations'

function makePlayer(id, position, number = 1) {
  return { id, position, number, firstName: '', lastName: '', isStarter: true }
}

describe('groupIntoLines', () => {
  it('groups 4-3-3 into 4 lines: [GK], [DEF×4], [MID×3], [FWD×3]', () => {
    const starters = [
      makePlayer('gk', 'GK', 1),
      makePlayer('d1', 'DEF', 2), makePlayer('d2', 'DEF', 3),
      makePlayer('d3', 'DEF', 4), makePlayer('d4', 'DEF', 5),
      makePlayer('m1', 'MID', 6), makePlayer('m2', 'MID', 7), makePlayer('m3', 'MID', 8),
      makePlayer('f1', 'FWD', 9), makePlayer('f2', 'FWD', 10), makePlayer('f3', 'FWD', 11),
    ]
    const lines = groupIntoLines(starters, '4-3-3')
    expect(lines).toHaveLength(4)   // GK-line + 3 formation segments
    expect(lines[0]).toHaveLength(1)  // GK
    expect(lines[1]).toHaveLength(4)  // DEF
    expect(lines[2]).toHaveLength(3)  // MID
    expect(lines[3]).toHaveLength(3)  // FWD
  })

  it('groups 3-5-2 into 4 lines: [GK], [DEF×3], [MID×5], [FWD×2]', () => {
    const starters = [
      makePlayer('gk', 'GK', 1),
      makePlayer('d1', 'DEF', 2), makePlayer('d2', 'DEF', 3), makePlayer('d3', 'DEF', 4),
      makePlayer('m1', 'MID', 5), makePlayer('m2', 'MID', 6), makePlayer('m3', 'MID', 7),
      makePlayer('m4', 'MID', 8), makePlayer('m5', 'MID', 9),
      makePlayer('f1', 'FWD', 10), makePlayer('f2', 'FWD', 11),
    ]
    const lines = groupIntoLines(starters, '3-5-2')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toHaveLength(1)  // GK
    expect(lines[1]).toHaveLength(3)  // DEF
    expect(lines[2]).toHaveLength(5)  // MID
    expect(lines[3]).toHaveLength(2)  // FWD
  })

  it('always places GK in first line regardless of order in input', () => {
    const starters = [
      makePlayer('f1', 'FWD', 9),
      makePlayer('gk', 'GK', 1),
      makePlayer('d1', 'DEF', 2),
    ]
    const lines = groupIntoLines(starters, '1-1')
    expect(lines[0][0].id).toBe('gk')
  })
})

describe('getEmptyStartersForFormation', () => {
  it('returns 11 players for 4-3-3', () => {
    const players = getEmptyStartersForFormation('4-3-3')
    expect(players).toHaveLength(11)
  })

  it('always starts with a GK', () => {
    const players = getEmptyStartersForFormation('4-3-3')
    expect(players[0].position).toBe('GK')
  })

  it('returns 11 players for 3-5-2', () => {
    const players = getEmptyStartersForFormation('3-5-2')
    expect(players).toHaveLength(11)
  })

  it('marks all returned players as starters', () => {
    const players = getEmptyStartersForFormation('4-2-3-1')
    expect(players.every((p) => p.isStarter)).toBe(true)
  })

  it('gives each player a unique id', () => {
    const players = getEmptyStartersForFormation('4-3-3')
    const ids = players.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
