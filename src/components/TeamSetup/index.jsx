import { useState } from 'react'
import { findTeamByName } from '../../utils/teamNames'
import TeamPanel from './TeamPanel'

export default function TeamSetup({ match, setMatch, matchMode, onViewLineup, positions, setPositions, onPendingPositions }) {
  const [homeAutoFixtureId, setHomeAutoFixtureId] = useState(null)
  const [awayAutoFixtureId, setAwayAutoFixtureId] = useState(null)

  function handleFixtureSelect(side, fixture) {
    const otherSide = side === 'homeTeam' ? 'awayTeam' : 'homeTeam'
    const myName = match[side].name.toUpperCase()
    const opponentName = fixture.home.toUpperCase() === myName ? fixture.away : fixture.home
    const found = findTeamByName(opponentName)
    setMatch((m) => ({
      ...m,
      // Remember the fixture so the Lineup view can load the confirmed XI later.
      fixture,
      ...(found
        ? { [otherSide]: { ...m[otherSide], name: found.name.toUpperCase(), flag: found.flag } }
        : {}),
    }))
    if (otherSide === 'awayTeam') setAwayAutoFixtureId(fixture.fixtureId)
    else setHomeAutoFixtureId(fixture.fixtureId)
  }

  return (
    <div className="px-4 py-6 max-w-screen-xl mx-auto">
      <div className="flex gap-4 flex-col xl:flex-row">
        <TeamPanel
          side="homeTeam"
          team={match.homeTeam}
          match={match}
          setMatch={setMatch}
          matchMode={matchMode}
          onFixtureSelect={(f) => handleFixtureSelect('homeTeam', f)}
          autoSelectFixtureId={homeAutoFixtureId}
          positions={positions}
          onPendingPositions={onPendingPositions}
        />
        <TeamPanel
          side="awayTeam"
          team={match.awayTeam}
          match={match}
          setMatch={setMatch}
          matchMode={matchMode}
          onFixtureSelect={(f) => handleFixtureSelect('awayTeam', f)}
          autoSelectFixtureId={awayAutoFixtureId}
          positions={positions}
          onPendingPositions={onPendingPositions}
        />
      </div>

      <div
        className="mt-4 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
      >
        <div className="flex-1 flex items-center gap-3">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
            Referee
          </label>
          <input
            value={match.referee}
            onChange={(e) =>
              setMatch((m) => ({ ...m, referee: e.target.value.toUpperCase() }))
            }
            placeholder="REFEREE NAME"
            className="flex-1 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-green-600"
            style={{ background: 'rgba(55,65,81,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>
        <button
          onClick={onViewLineup}
          className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)', boxShadow: '0 0 20px rgba(109,40,217,0.22)' }}
        >
          View Lineup →
        </button>
      </div>
    </div>
  )
}
