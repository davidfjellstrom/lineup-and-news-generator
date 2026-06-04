import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import PlayerCard from './PlayerCard'
import SubstitutesPanel from './SubstitutesPanel'
import { groupIntoLines, FORMATIONS } from '../utils/formations'
import { useDragAndDrop } from '../hooks/useDragAndDrop'

const TEAM_COLORS = [
  { label: 'Blå',    value: '#60a5fa' },
  { label: 'Röd',    value: '#f87171' },
  { label: 'Gul',    value: '#fbbf24' },
  { label: 'Grön',   value: '#4ade80' },
  { label: 'Orange', value: '#fb923c' },
  { label: 'Svart',  value: '#1f2937' },
  { label: 'Vit',    value: '#ffffff' },
  { label: 'Arg.blå', value: '#74acdf' },
]

function PenaltyBox({ side }) {
  const isHome = side === 'home'
  const b = '1px solid rgba(255,255,255,0.28)'
  const bl = '1px solid rgba(255,255,255,0.2)'
  return (
    <>
      <div className="absolute" style={{
        top: '25%', height: '50%', width: '12%',
        ...(isHome ? { left: 0, borderRight: b, borderTop: b, borderBottom: b }
                   : { right: 0, borderLeft: b, borderTop: b, borderBottom: b }),
      }} />
      <div className="absolute" style={{
        top: '37%', height: '26%', width: '5%',
        ...(isHome ? { left: 0, borderRight: bl, borderTop: bl, borderBottom: bl }
                   : { right: 0, borderLeft: bl, borderTop: bl, borderBottom: bl }),
      }} />
    </>
  )
}

const HOME_X_START = 5
const HOME_X_END   = 46
const AWAY_X_START = 54
const AWAY_X_END   = 95

function computePositions(homeLines, awayLines) {
  const pos = {}
  const place = (lines, xStart, xEnd) => {
    const n = lines.length
    lines.forEach((line, li) => {
      const x = n <= 1 ? (xStart + xEnd) / 2 : xStart + (li / (n - 1)) * (xEnd - xStart)
      line.forEach((player, pi) => {
        pos[player.id] = { x, y: (pi + 1) / (line.length + 1) * 100 }
      })
    })
  }
  place(homeLines, HOME_X_START, HOME_X_END)
  place(awayLines, AWAY_X_START, AWAY_X_END)
  return pos
}

const Pitch = forwardRef(function Pitch({ match, matchMode, onNoteChange, onPhotoChange, onUpdateStarter, onFormationChange }, ref) {
  const { homeTeam, awayTeam, referee } = match

  const homeStarters = homeTeam.players.filter((p) => p.isStarter)
  const awayStarters = awayTeam.players.filter((p) => p.isStarter)
  const homeLines = groupIntoLines(homeStarters, homeTeam.formation, 'home')
  const awayLinesDisplay = [...groupIntoLines(awayStarters, awayTeam.formation, 'away')].reverse()

  const starterKey = useMemo(
    () => [...homeStarters, ...awayStarters].map((p) => p.id).sort().join(','),
    [homeTeam.players, awayTeam.players],
  )

  const sideOf = useMemo(() => {
    const map = {}
    homeTeam.players.forEach((p) => { map[p.id] = 'homeTeam' })
    awayTeam.players.forEach((p) => { map[p.id] = 'awayTeam' })
    return map
  }, [homeTeam.players, awayTeam.players])

  const allPlayersById = useMemo(() => {
    const map = {}
    ;[...homeTeam.players, ...awayTeam.players].forEach((p) => { map[p.id] = p })
    return map
  }, [homeTeam.players, awayTeam.players])

  const [positions, setPositionsState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wc2026-positions') || '{}') } catch { return {} }
  })

  function setPositions(updater) {
    setPositionsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem('wc2026-positions', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const [homeColor, setHomeColor] = useState(
    () => localStorage.getItem('wc2026-homeColor') || '#60a5fa'
  )
  const [awayColor, setAwayColor] = useState(
    () => localStorage.getItem('wc2026-awayColor') || '#f87171'
  )
  function pickHomeColor(v) { setHomeColor(v); localStorage.setItem('wc2026-homeColor', v) }
  function pickAwayColor(v) { setAwayColor(v); localStorage.setItem('wc2026-awayColor', v) }

  const { draggedId, ghost, hoverSubs, startStarterDrag, startSubDrag, pitchRef, subsRef } =
    useDragAndDrop({ onUpdateStarter, sideOf, setPositions })

  // When starters change (swap/add/remove): fill in defaults for new players, preserve dragged positions.
  useEffect(() => {
    const defaults = computePositions(homeLines, awayLinesDisplay)
    const starterIdSet = new Set([...homeStarters, ...awayStarters].map((p) => p.id))
    setPositions((prev) => {
      const next = {}
      starterIdSet.forEach((id) => {
        next[id] = prev[id] || defaults[id] || { x: 50, y: 50 }
      })
      return next
    })
  }, [starterKey])

  // When formation changes: reset all positions to match the new layout.
  useEffect(() => {
    if (!homeStarters.length && !awayStarters.length) return
    const defaults = computePositions(homeLines, awayLinesDisplay)
    setPositions(
      Object.fromEntries(
        [...homeStarters, ...awayStarters].map((p) => [p.id, defaults[p.id] || { x: 50, y: 50 }])
      )
    )
  }, [homeTeam.formation, awayTeam.formation])
  useImperativeHandle(ref, () => ({
    async exportPPTX() {
      const { exportPptx } = await import('../utils/exportPptx')
      await exportPptx({ match, positions, matchMode })
    },
  }), [match, positions, matchMode])

  function top5Ids(players) {
    return new Set(
      [...players]
        .filter((p) => p.marketValue)
        .sort((a, b) => b.marketValue - a.marketValue)
        .slice(0, 5)
        .map((p) => p.id)
    )
  }
  const homeTop5 = top5Ids(homeTeam.players)
  const awayTop5 = top5Ids(awayTeam.players)

  const allStarters = [...homeStarters, ...awayStarters]

  return (
    <div className="px-3 py-4 min-w-0">
      <div id="pitch-export" className="rounded-xl overflow-hidden" style={{ background: '#111827' }}>

        {/* Team headers */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: '#1f2937' }}>
          <div>
            <div className="flex items-center gap-2 text-lg font-extrabold tracking-wide">
              <span>{homeTeam.flag}</span>
              <span>{homeTeam.name}</span>
              <select
                value={homeTeam.formation}
                onChange={(e) => onFormationChange('homeTeam', e.target.value)}
                className="text-sm font-semibold rounded px-1 py-0.5 cursor-pointer"
                style={{ background: '#14532d', color: '#4ade80', border: 'none', outline: 'none' }}
              >
                {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select
                value={homeColor}
                onChange={(e) => pickHomeColor(e.target.value)}
                className="text-xs rounded px-1 py-0.5 cursor-pointer font-semibold"
                style={{ background: '#1f2937', color: homeColor, border: `1px solid ${homeColor}`, outline: 'none' }}
              >
                {TEAM_COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
              <span className="text-gray-300">{homeTeam.coach}</span>
              {homeTeam.fifaRanking && <span>#{homeTeam.fifaRanking}</span>}
              {homeTeam.avgAge && <span>{String(homeTeam.avgAge).replace('.', ',')}å</span>}
              {homeTeam.squadValue && <span>€{homeTeam.squadValue}M</span>}
            </div>
          </div>
          <div className="text-center flex flex-col items-center gap-1">
            <div className="text-xs uppercase tracking-widest text-gray-500">Referee</div>
            <div className="text-sm text-gray-300 font-medium">{referee}</div>
            <div
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: matchMode === 'match' ? 'rgba(20,83,45,0.8)' : 'rgba(120,53,15,0.8)',
                color: matchMode === 'match' ? '#86efac' : '#fde68a',
                border: `1px solid ${matchMode === 'match' ? '#16a34a' : '#d97706'}`,
              }}
            >
              {matchMode === 'match' ? '● Bekräftad' : '◌ Estimerad'}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-lg font-extrabold tracking-wide justify-end">
              <select
                value={awayColor}
                onChange={(e) => pickAwayColor(e.target.value)}
                className="text-xs rounded px-1 py-0.5 cursor-pointer font-semibold"
                style={{ background: '#1f2937', color: awayColor, border: `1px solid ${awayColor}`, outline: 'none' }}
              >
                {TEAM_COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select
                value={awayTeam.formation}
                onChange={(e) => onFormationChange('awayTeam', e.target.value)}
                className="text-sm font-semibold rounded px-1 py-0.5 cursor-pointer"
                style={{ background: '#14532d', color: '#4ade80', border: 'none', outline: 'none' }}
              >
                {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <span>{awayTeam.name}</span>
              <span>{awayTeam.flag}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2 justify-end">
              <span className="text-gray-300">{awayTeam.coach}</span>
              {awayTeam.fifaRanking && <span>#{awayTeam.fifaRanking}</span>}
              {awayTeam.avgAge && <span>{String(awayTeam.avgAge).replace('.', ',')}å</span>}
              {awayTeam.squadValue && <span>€{awayTeam.squadValue}M</span>}
            </div>
          </div>
        </div>

        {/* Green pitch */}
        <div
          ref={pitchRef}
          className="relative"
          style={{
            background: '#1a6b3c',
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0px, transparent 80px, rgba(0,0,0,0.07) 80px, rgba(0,0,0,0.07) 160px)',
            minHeight: 560,
            border: '2px solid rgba(255,255,255,0.15)',
            userSelect: 'none',
            outline: ghost ? '2px solid rgba(255,255,255,0.25)' : 'none',
          }}
        >
          <PenaltyBox side="home" />
          <PenaltyBox side="away" />
          <div className="absolute top-0 bottom-0"
            style={{ left: '50%', width: 1, background: 'rgba(255,255,255,0.3)' }} />
          <div className="absolute rounded-full" style={{
            width: 120, height: 120,
            border: '1px solid rgba(255,255,255,0.3)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          <div className="absolute rounded-full" style={{
            width: 6, height: 6,
            background: 'rgba(255,255,255,0.55)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />

          {allStarters.map((player) => {
            const pos = positions[player.id]
            if (!pos) return null
            return (
              <div
                key={player.id}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: draggedId === player.id ? 'grabbing' : 'grab',
                  zIndex: draggedId === player.id ? 20 : 1,
                }}
                onMouseDown={(e) => {
                  if (e.target.contentEditable === 'true') return
                  e.preventDefault()
                  startStarterDrag(player.id)
                }}
              >
                <PlayerCard
                  player={player}
                  compact={false}
                  isTop5={homeTop5.has(player.id) || awayTop5.has(player.id)}
                  teamColor={sideOf[player.id] === 'homeTeam' ? homeColor : awayColor}
                  onNoteChange={(note) => onNoteChange(sideOf[player.id], player.id, note)}
                  onPhotoChange={onPhotoChange ? (photo) => onPhotoChange(sideOf[player.id], player.id, photo) : undefined}
                />
              </div>
            )
          })}

          {ghost && (
            <div style={{
              position: 'absolute',
              left: `${ghost.x}%`,
              top: `${ghost.y}%`,
              transform: 'translate(-50%, -50%)',
              cursor: 'grabbing',
              zIndex: 20,
              opacity: 0.85,
            }}>
              <PlayerCard player={ghost.player} compact={false} onNoteChange={() => {}} />
            </div>
          )}
        </div>

        <div ref={subsRef}>
          <SubstitutesPanel
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            isDropTarget={hoverSubs}
            onSubDragStart={startSubDrag}
            onNoteChange={onNoteChange}
            onPhotoChange={onPhotoChange}
            homeTop5={homeTop5}
            awayTop5={awayTop5}
            homeColor={homeColor}
            awayColor={awayColor}
          />
        </div>
      </div>
    </div>
  )
})

export default Pitch
