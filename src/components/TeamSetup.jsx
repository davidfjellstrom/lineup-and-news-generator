import { useState } from 'react'
import { FORMATIONS, getEmptyStartersForFormation } from '../utils/formations'
import { WC2026_TEAMS } from '../data/wc2026Teams'

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD']

function TeamPicker({ value, flag, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = query.trim()
    ? WC2026_TEAMS.filter((t) =>
        t.name.toLowerCase().includes(query.toLowerCase())
      )
    : WC2026_TEAMS

  function select(team) {
    onChange({ name: team.name.toUpperCase(), flag: team.flag })
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative flex-1 min-w-32">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer"
        style={{ background: '#374151' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xl">{flag || '🏳️'}</span>
        <span className="text-sm font-bold text-white flex-1 truncate">
          {value || 'Select team…'}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div
          className="absolute z-50 top-10 left-0 right-0 rounded-lg shadow-2xl overflow-hidden"
          style={{ background: '#1f2937', border: '1px solid #374151', minWidth: 220 }}
        >
          <div className="p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team…"
              className="w-full rounded px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-green-600"
              style={{ background: '#374151' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">No results</div>
            )}
            {filtered.map((team) => (
              <button
                key={team.name}
                onClick={() => select(team)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors"
              >
                <span className="text-lg">{team.flag}</span>
                <span className="text-white">{team.name}</span>
                <span className="ml-auto text-xs text-gray-500">Group {team.group}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerRow({ player, side, updatePlayer, deletePlayer }) {
  const up = (field, val) => updatePlayer(side, player.id, { [field]: val })

  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      {/* # */}
      <td className="px-1 py-1">
        <input
          type="number"
          value={player.number}
          onChange={(e) => up('number', parseInt(e.target.value) || '')}
          className="w-10 bg-transparent text-center text-white text-xs outline-none rounded focus:ring-1 focus:ring-green-600"
          min={1}
          max={99}
        />
      </td>
      {/* Position */}
      <td className="px-1 py-1">
        <select
          value={player.position}
          onChange={(e) => up('position', e.target.value)}
          className="bg-gray-700 text-white text-xs rounded px-1 py-0.5 outline-none"
        >
          {POSITIONS.map((p) => <option key={p}>{p}</option>)}
        </select>
      </td>
      {/* First name */}
      <td className="px-1 py-1">
        <input
          value={player.firstName}
          onChange={(e) => up('firstName', e.target.value.toUpperCase())}
          placeholder="FIRST"
          className="w-20 bg-transparent text-white text-xs outline-none rounded px-1 focus:ring-1 focus:ring-green-600"
        />
      </td>
      {/* Last name */}
      <td className="px-1 py-1">
        <input
          value={player.lastName}
          onChange={(e) => up('lastName', e.target.value.toUpperCase())}
          placeholder="LAST"
          className="w-24 bg-transparent text-white text-xs outline-none rounded px-1 focus:ring-1 focus:ring-green-600"
        />
      </td>
      {/* Club */}
      <td className="px-1 py-1">
        <input
          value={player.clubName}
          onChange={(e) => up('clubName', e.target.value)}
          placeholder="Club"
          className="w-24 bg-transparent text-white text-xs outline-none rounded px-1 focus:ring-1 focus:ring-green-600"
        />
      </td>
      {/* Logo */}
      <td className="px-1 py-1">
        <div className="flex items-center justify-center">
          {player.clubLogo ? (
            <img
              src={player.clubLogo}
              alt=""
              title={player.clubLogo}
              style={{ width: 22, height: 22, objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div className="text-gray-600 text-xs">—</div>
          )}
        </div>
      </td>
      {/* Delete */}
      <td className="px-1 py-1 text-center">
        <button
          onClick={() => deletePlayer(side, player.id)}
          className="text-red-500 hover:text-red-400 text-xs px-1"
          title="Delete"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

function TeamPanel({ side, team, match, setMatch, matchMode }) {
  const label = side === 'homeTeam' ? 'Home Team' : 'Away Team'
  const starters = team.players.filter((p) => p.isStarter)
  const subs = team.players.filter((p) => !p.isStarter)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [source, setSource] = useState(null)

  async function fetchSquad() {
    if (!team.name.trim()) return
    setFetching(true)
    setFetchError(null)
    setSource(null)
    try {
      const res = await fetch(
        `/api/lineup?team=${encodeURIComponent(team.name)}&formation=${encodeURIComponent(team.formation)}&mode=${encodeURIComponent(matchMode)}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()

      // Stöd både nytt format (starters/substitutes) och gammalt (players)
      const starters = data.starters ?? data.players ?? []
      const substitutes = data.substitutes ?? []

      if (starters.length === 0) throw new Error('Inga spelare returnerades')

      function toPlayer(p, isStarter) {
        return {
          id: crypto.randomUUID(),
          number: p.number ?? '',
          firstName: (p.firstName ?? '').toUpperCase(),
          lastName: (p.lastName ?? '').toUpperCase(),
          position: ['GK', 'DEF', 'MID', 'FWD'].includes(p.position) ? p.position : 'MID',
          photo: '',
          clubLogo: p.clubLogoUrl ?? '',
          clubName: p.clubName ?? '',
          notes: '',
          isStarter,
        }
      }

      const allPlayers = [
        ...starters.map((p) => toPlayer(p, true)),
        ...substitutes.map((p) => toPlayer(p, false)),
      ]

      setMatch((m) => ({
        ...m,
        [side]: {
          ...m[side],
          ...(data.flag  ? { flag: data.flag }   : {}),
          ...(data.coach ? { coach: data.coach } : {}),
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

  function updatePlayer(_, playerId, updates) {
    setMatch((m) => ({
      ...m,
      [side]: {
        ...m[side],
        players: m[side].players.map((p) =>
          p.id === playerId ? { ...p, ...updates } : p
        ),
      },
    }))
  }

  function deletePlayer(_, playerId) {
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

  const thClass = 'px-1 py-1.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap'
  const sectionClass = 'text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 mt-3'

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
            disabled={fetching || !team.name.trim()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: fetching ? '#374151' : matchMode === 'match' ? '#15803d' : '#92400e' }}
            title={!team.name.trim() ? 'Fyll i lagnamnet först' : `Hämta trupp för ${team.name}`}
          >
            {fetching ? (
              <>
                <span className="animate-spin inline-block">⟳</span>
                Hämtar…
              </>
            ) : matchMode === 'match' ? (
              <>✦ Hämta officiell uppställning</>
            ) : (
              <>✦ Hämta trolig uppställning</>
            )}
          </button>
          {fetchError && (
            <p className="text-red-400 text-xs mt-1">{fetchError}</p>
          )}
          {source && (
            <p className="text-xs mt-1" style={{ color: matchMode === 'match' ? '#86efac' : '#fde68a' }}>
              Källa: {source}
            </p>
          )}
        </div>

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
                <PlayerRow
                  key={p.id}
                  player={p}
                  side={side}
                  updatePlayer={updatePlayer}
                  deletePlayer={deletePlayer}
                />
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
                <PlayerRow
                  key={p.id}
                  player={p}
                  side={side}
                  updatePlayer={updatePlayer}
                  deletePlayer={deletePlayer}
                />
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

export default function TeamSetup({ match, setMatch, matchMode, onViewLineup }) {
  return (
    <div className="px-4 py-6 max-w-screen-xl mx-auto">
      {/* Teams */}
      <div className="flex gap-4 flex-col xl:flex-row">
        <TeamPanel side="homeTeam" team={match.homeTeam} match={match} setMatch={setMatch} matchMode={matchMode} />
        <TeamPanel side="awayTeam" team={match.awayTeam} match={match} setMatch={setMatch} matchMode={matchMode} />
      </div>

      {/* Referee + CTA */}
      <div
        className="mt-4 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.06)' }}
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
            style={{ background: '#374151' }}
          />
        </div>
        <button
          onClick={onViewLineup}
          className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-colors hover:bg-green-500"
          style={{ background: '#16a34a' }}
        >
          View Lineup →
        </button>
      </div>
    </div>
  )
}
