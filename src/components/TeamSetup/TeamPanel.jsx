import { useState } from 'react'
import { FORMATIONS, getEmptyStartersForFormation } from '../../utils/formations'
import TeamPicker from './TeamPicker'
import PlayerRow from './PlayerRow'
import FixturePicker from './FixturePicker'

const thClass = 'px-1 py-1.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap'
const sectionClass = 'text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 mt-3'

const VALID_POSITIONS = ['GK', 'DEF', 'MID', 'FWD']

function toPlayer(p, isStarter) {
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

export default function TeamPanel({ side, team, match, setMatch, matchMode, onFixtureSelect, autoSelectFixtureId }) {
  const label = side === 'homeTeam' ? 'Home Team' : 'Away Team'
  const starters = team.players.filter((p) => p.isStarter)
  const subs = team.players.filter((p) => !p.isStarter)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [source, setSource] = useState(null)
  const [selectedFixture, setSelectedFixture] = useState(null)

  async function fetchSquad() {
    if (!team.name.trim()) return
    if (matchMode === 'match' && !selectedFixture) return
    setFetching(true)
    setFetchError(null)
    setSource(null)
    try {
      const params = new URLSearchParams({
        team: team.name,
        formation: team.formation,
        mode: matchMode,
      })
      if (matchMode === 'match' && selectedFixture) {
        params.set('fixture_id', selectedFixture.fixtureId)
      }
      const res = await fetch(`/api/lineup?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()

      const startersData = data.starters ?? data.players ?? []
      const substitutes = data.substitutes ?? []

      if (startersData.length === 0) throw new Error('Inga spelare returnerades')

      const allPlayers = [
        ...startersData.map((p) => toPlayer(p, true)),
        ...substitutes.map((p) => toPlayer(p, false)),
      ]

      setMatch((m) => ({
        ...m,
        [side]: {
          ...m[side],
          ...(data.flag          ? { flag: data.flag }               : {}),
          ...(data.coach         ? { coach: data.coach }             : {}),
          ...(data.fifaRanking != null ? { fifaRanking: data.fifaRanking } : {}),
          ...(data.avgAge      != null ? { avgAge: data.avgAge }     : {}),
          ...(data.squadValue  != null ? { squadValue: data.squadValue }   : {}),
          players: allPlayers,
        },
      }))
      if (data.source) setSource(data.source)
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setFetching(false)
    }
  }

  function updateTeam(updates) {
    setMatch((m) => ({ ...m, [side]: { ...m[side], ...updates } }))
  }

  function updatePlayer(playerId, updates) {
    setMatch((m) => ({
      ...m,
      [side]: {
        ...m[side],
        players: m[side].players.map((p) => p.id === playerId ? { ...p, ...updates } : p),
      },
    }))
  }

  function deletePlayer(playerId) {
    setMatch((m) => ({
      ...m,
      [side]: {
        ...m[side],
        players: m[side].players.filter((p) => p.id !== playerId),
      },
    }))
  }

  function addPlayer(isStarter) {
    const newPlayer = {
      id: crypto.randomUUID(),
      number: team.players.length + 1,
      firstName: '',
      lastName: '',
      position: isStarter ? 'FWD' : 'MID',
      photo: '',
      clubLogo: '',
      clubName: '',
      notes: '',
      isStarter,
    }
    setMatch((m) => ({
      ...m,
      [side]: { ...m[side], players: [...m[side].players, newPlayer] },
    }))
  }

  function resetStarters() {
    const empty = getEmptyStartersForFormation(team.formation)
    const nonStarters = team.players.filter((p) => !p.isStarter)
    setMatch((m) => ({
      ...m,
      [side]: { ...m[side], players: [...empty, ...nonStarters] },
    }))
  }

  function saveTeam() {
    const defaultName = team.name
      ? team.name.charAt(0) + team.name.slice(1).toLowerCase()
      : 'lag'
    const input = window.prompt('Döp filen:', defaultName)
    if (input === null) return
    const fileName = (input.trim() || defaultName).replace(/\.json$/i, '') + '.json'
    const blob = new Blob([JSON.stringify(team, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function loadTeam(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const loaded = JSON.parse(ev.target.result)
        const players = (loaded.players ?? []).map((p) => ({ ...p, id: crypto.randomUUID() }))
        setMatch((m) => ({ ...m, [side]: { ...loaded, players } }))
      } catch {
        alert('Filen kunde inte läsas — kontrollera att det är en giltig lagfil (.json).')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleFixtureSelected(fixture) {
    setSelectedFixture(fixture)
    onFixtureSelect?.(fixture)
  }

  return (
    <div className="flex-1 min-w-0">
      <div
        className="rounded-xl p-4"
        style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          {label}
        </h2>

        {/* AI fetch */}
        <div className="mb-3">
          <button
            onClick={fetchSquad}
            disabled={fetching || !team.name.trim() || (matchMode === 'match' && !selectedFixture)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: fetching ? '#374151' : matchMode === 'match' ? '#15803d' : '#92400e' }}
            title={
              !team.name.trim() ? 'Välj lag först' :
              matchMode === 'match' && !selectedFixture ? 'Välj en match först' :
              `Hämta trupp för ${team.name}`
            }
          >
            {fetching ? (
              <><span className="animate-spin inline-block">⟳</span>Hämtar…</>
            ) : matchMode === 'match' ? (
              <>✦ Hämta officiell uppställning</>
            ) : (
              <>✦ Hämta trolig uppställning</>
            )}
          </button>
          {fetchError && <p className="text-red-400 text-xs mt-1">{fetchError}</p>}
          {source && (
            <p className="text-xs mt-1" style={{ color: matchMode === 'match' ? '#86efac' : '#fde68a' }}>
              Källa: {source}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={saveTeam}
              disabled={team.players.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40 hover:brightness-110"
              style={{ background: '#1d4ed8' }}
              title="Spara laget som en fil"
            >
              💾 Spara lag
            </button>
            <label
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer transition-colors hover:brightness-110"
              style={{ background: '#374151' }}
              title="Ladda ett sparat lag från fil"
            >
              📂 Ladda lag
              <input type="file" accept=".json" className="hidden" onChange={loadTeam} />
            </label>
          </div>
        </div>

        {matchMode === 'match' && (
          <FixturePicker
            teamName={team.name}
            onSelect={handleFixtureSelected}
            autoSelectFixtureId={autoSelectFixtureId}
          />
        )}

        {/* Team info */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <TeamPicker
            value={team.name}
            flag={team.flag}
            onChange={({ name, flag }) => updateTeam({ name, flag })}
          />
          <select
            value={team.formation}
            onChange={(e) => updateTeam({ formation: e.target.value })}
            className="rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-green-600"
            style={{ background: '#374151' }}
          >
            {FORMATIONS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <input
            value={team.coach}
            onChange={(e) => updateTeam({ coach: e.target.value.toUpperCase() })}
            placeholder="COACH NAME"
            className="w-full rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-green-600"
            style={{ background: '#374151' }}
          />
        </div>

        {/* Starters */}
        <div className={sectionClass}>Starters ({starters.length}/11)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Pos</th>
                <th className={thClass}>First</th>
                <th className={thClass}>Last</th>
                <th className={thClass}>Club</th>
                <th className={thClass}>Logo</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {starters.map((p) => (
                <PlayerRow key={p.id} player={p} updatePlayer={updatePlayer} deletePlayer={deletePlayer} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => addPlayer(true)}
            className="text-xs px-3 py-1 rounded-lg text-white hover:bg-green-700 transition-colors"
            style={{ background: '#16a34a' }}
          >
            + Add Starter
          </button>
          <button
            onClick={resetStarters}
            className="text-xs px-3 py-1 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
            style={{ background: '#374151' }}
            title="Replace starters with empty slots matching the formation"
          >
            ↺ Reset Formation
          </button>
        </div>

        {/* Substitutes */}
        <div className={sectionClass + ' mt-4'}>Substitutes ({subs.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Pos</th>
                <th className={thClass}>First</th>
                <th className={thClass}>Last</th>
                <th className={thClass}>Club</th>
                <th className={thClass}>Logo</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((p) => (
                <PlayerRow key={p.id} player={p} updatePlayer={updatePlayer} deletePlayer={deletePlayer} />
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => addPlayer(false)}
          className="text-xs px-3 py-1 rounded-lg text-gray-300 hover:bg-white/10 transition-colors mt-2"
          style={{ background: '#374151' }}
        >
          + Add Sub
        </button>
      </div>
    </div>
  )
}
