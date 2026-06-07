import { useState, useMemo } from 'react'
import { FORMATIONS, getEmptyStartersForFormation } from '../../utils/formations'
import TeamPicker from './TeamPicker'
import PlayerRow from './PlayerRow'
import FixturePicker from './FixturePicker'

const thClass = 'px-1 py-1.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap uppercase tracking-wider'
const sectionClass = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 mt-4 flex items-center gap-2'

const SAVED_TEAMS_KEY = 'wc2026-saved-teams'

function getSavedTeams() {
  try { return JSON.parse(localStorage.getItem(SAVED_TEAMS_KEY) || '{}') } catch { return {} }
}

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

export default function TeamPanel({ side, team, match, setMatch, matchMode, onFixtureSelect, autoSelectFixtureId, positions, onPositionsChange }) {
  const label = side === 'homeTeam' ? 'Home Team' : 'Away Team'
  const starters = team.players.filter((p) => p.isStarter)
  const subs = team.players.filter((p) => !p.isStarter)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [source, setSource] = useState(null)
  const [selectedFixture, setSelectedFixture] = useState(null)
  const [savedTeams, setSavedTeams] = useState(() => getSavedTeams())
  const [selectedSave, setSelectedSave] = useState('')
  const savedTeamNames = useMemo(() => Object.keys(savedTeams).sort(), [savedTeams])

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
    const input = window.prompt('Döp till:', defaultName)
    if (input === null) return
    const name = input.trim() || defaultName

    const all = getSavedTeams()
    if (all[name] && !window.confirm(`"${name}" finns redan. Skriva över?`)) return

    const savedPositions = {}
    if (positions) {
      team.players.filter((p) => p.isStarter).forEach((p) => {
        if (positions[p.id]) savedPositions[String(p.number)] = positions[p.id]
      })
    }

    all[name] = { ...team, savedPositions }
    try {
      localStorage.setItem(SAVED_TEAMS_KEY, JSON.stringify(all))
      const refreshed = getSavedTeams()
      setSavedTeams(refreshed)
      setSelectedSave(name)
    } catch {
      alert('Kunde inte spara — webbläsarens lagring kan vara full.')
    }
  }

  function loadTeam(name) {
    if (!name) return
    const all = getSavedTeams()
    const saved = all[name]
    if (!saved) return

    const { savedPositions = {}, ...teamData } = saved
    const players = (teamData.players ?? []).map((p) => ({ ...p, id: crypto.randomUUID() }))

    if (Object.keys(savedPositions).length > 0 && onPositionsChange) {
      onPositionsChange((prev) => {
        const next = { ...prev }
        players.forEach((p) => {
          const pos = savedPositions[String(p.number)]
          if (pos) next[p.id] = pos
        })
        return next
      })
    }

    setMatch((m) => ({ ...m, [side]: { ...teamData, players } }))
  }

  function handleFixtureSelected(fixture) {
    setSelectedFixture(fixture)
    onFixtureSelect?.(fixture)
  }

  return (
    <div className="flex-1 min-w-0">
      <div
        className="rounded-xl p-4"
        style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)', boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #4338ca, #7c3aed)' }} />
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
            {label}
          </h2>
        </div>

        {/* AI fetch */}
        <div className="mb-3">
          <button
            onClick={fetchSquad}
            disabled={fetching || !team.name.trim() || (matchMode === 'match' && !selectedFixture)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{
              background: fetching
                ? '#374151'
                : matchMode === 'match'
                  ? 'linear-gradient(135deg, #15803d, #166534)'
                  : 'linear-gradient(135deg, #4338ca, #7c3aed)',
              boxShadow: fetching ? 'none' : matchMode === 'match'
                ? '0 0 18px rgba(22,163,74,0.28)'
                : '0 0 20px rgba(109,40,217,0.22)',
            }}
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
              title="Spara laget i webbläsaren"
            >
              💾 Spara lag
            </button>
          </div>
          {savedTeamNames.length > 0 && (
            <div className="flex gap-2 mt-2 items-center">
              <select
                value={selectedSave}
                onChange={(e) => setSelectedSave(e.target.value)}
                className="flex-1 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ background: '#374151', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="">Välj sparat lag…</option>
                {savedTeamNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button
                onClick={() => loadTeam(selectedSave)}
                disabled={!selectedSave}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40 hover:brightness-110"
                style={{ background: '#374151' }}
              >
                📂 Ladda
              </button>
            </div>
          )}
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
        <div className={sectionClass}>
          <span>Starters ({starters.length}/11)</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
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
            className="text-xs px-3 py-1 rounded-lg transition-colors hover:bg-indigo-500/10"
            style={{ background: 'transparent', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc' }}
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
        <div className={sectionClass + ' mt-4'}>
          <span>Substitutes ({subs.length})</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
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
          className="text-xs px-3 py-1 rounded-lg transition-colors hover:bg-indigo-500/10 mt-2"
          style={{ background: 'transparent', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc' }}
        >
          + Add Sub
        </button>
      </div>
    </div>
  )
}
