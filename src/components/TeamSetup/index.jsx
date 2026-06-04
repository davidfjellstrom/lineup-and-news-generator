import { useState } from 'react'
import { WC2026_TEAMS } from '../../data/wc2026Teams'
import TeamPanel from './TeamPanel'

const AF_NAME_ALIASES = {
  'korea republic': 'South Korea',
  'south korea': 'South Korea',
  "cote d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'turkey': 'Türkiye',
  'turkiye': 'Türkiye',
  'usa': 'United States',
  'united states': 'United States',
  'bosnia': 'Bosnia and Herzegovina',
  'dr congo': 'DR Congo',
  'congo dr': 'DR Congo',
}

function findTeamByName(name) {
  const lower = name.toLowerCase()
  const canonical = AF_NAME_ALIASES[lower] || name
  return (
    WC2026_TEAMS.find((t) => t.name.toUpperCase() === canonical.toUpperCase()) ||
    WC2026_TEAMS.find(
      (t) =>
        t.name.toUpperCase().includes(lower.toUpperCase()) ||
        lower.toUpperCase().includes(t.name.toUpperCase()),
    )
  )
}

export default function TeamSetup({ match, setMatch, matchMode, onViewLineup }) {
  const [homeAutoFixtureId, setHomeAutoFixtureId] = useState(null)
  const [awayAutoFixtureId, setAwayAutoFixtureId] = useState(null)

  function handleFixtureSelect(side, fixture) {
    const otherSide = side === 'homeTeam' ? 'awayTeam' : 'homeTeam'
    const myName = match[side].name.toUpperCase()
    const opponentName = fixture.home.toUpperCase() === myName ? fixture.away : fixture.home
    const found = findTeamByName(opponentName)
    if (found) {
      setMatch((m) => ({
        ...m,
        [otherSide]: { ...m[otherSide], name: found.name.toUpperCase(), flag: found.flag },
      }))
    }
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
        />
        <TeamPanel
          side="awayTeam"
          team={match.awayTeam}
          match={match}
          setMatch={setMatch}
          matchMode={matchMode}
          onFixtureSelect={(f) => handleFixtureSelect('awayTeam', f)}
          autoSelectFixtureId={awayAutoFixtureId}
        />
      </div>

      <div
        className="mt-4 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: '#1e3330', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex-1 flex items-center gap-3">
          <label className="text-xs text-gray-400 uppercase tracking-wider whitespace-nowrap">
            Referee
          </label>
          <input
            value={match.referee}
            onChange={(e) =>
              setMatch((m) => ({ ...m, referee: e.target.value.toUpperCase() }))
            }
            placeholder="REFEREE NAME"
            className="flex-1 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-green-600"
            style={{ background: '#243f3c' }}
          />
        </div>
        <button
          onClick={onViewLineup}
          className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-colors hover:brightness-110"
          style={{ background: '#57ba98' }}
        >
          View Lineup →
        </button>
      </div>
    </div>
  )
}
