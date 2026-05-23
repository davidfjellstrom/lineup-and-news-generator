import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import PlayerCard from './PlayerCard'
import SubstitutesPanel from './SubstitutesPanel'
import { groupIntoLines } from '../utils/formations'

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

// Percentage bounds keeping players away from the pitch edges and the centre line
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

const Pitch = forwardRef(function Pitch({ match, matchMode, onNoteChange, onUpdateStarter }, ref) {
  const { homeTeam, awayTeam, referee } = match

  const homeStarters = homeTeam.players.filter((p) => p.isStarter)
  const awayStarters = awayTeam.players.filter((p) => p.isStarter)
  const homeLines = groupIntoLines(homeStarters, homeTeam.formation)
  const awayLinesDisplay = [...groupIntoLines(awayStarters, awayTeam.formation)].reverse()

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

  // Positions for starters on the pitch. Preserve manually-dragged positions across swaps.
  const [positions, setPositions] = useState({})
  const [draggedId, setDraggedId] = useState(null)
  // Ghost = a substitute being dragged onto the pitch
  const [ghost, setGhost] = useState(null) // { player, x, y }
  // Whether a starter is currently being dragged over the subs section
  const [hoverSubs, setHoverSubs] = useState(false)

  const dragging = useRef(null) // { playerId, fromSubs }
  const pitchRef = useRef(null)
  const subsRef = useRef(null)

  // Recompute default positions when lineup changes; preserve existing dragged positions.
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
  }, [starterKey, homeTeam.formation, awayTeam.formation])

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current || !pitchRef.current) return
      const rect = pitchRef.current.getBoundingClientRect()
      const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100))

      if (dragging.current.fromSubs) {
        setGhost((g) => g ? { ...g, x, y } : g)
        setPositions((prev) => ({ ...prev, [dragging.current.playerId]: { x, y } }))
      } else {
        setPositions((prev) => ({ ...prev, [dragging.current.playerId]: { x, y } }))
        // Detect if hovering over subs panel
        const subsRect = subsRef.current?.getBoundingClientRect()
        setHoverSubs(
          subsRect
            ? e.clientX >= subsRect.left && e.clientX <= subsRect.right &&
              e.clientY >= subsRect.top && e.clientY <= subsRect.bottom
            : false,
        )
      }
    }

    function onUp(e) {
      if (!dragging.current) return
      const { playerId, fromSubs } = dragging.current

      if (fromSubs) {
        // Sub dragged — was it dropped on the pitch?
        const pitchRect = pitchRef.current?.getBoundingClientRect()
        const onPitch = pitchRect &&
          e.clientX >= pitchRect.left && e.clientX <= pitchRect.right &&
          e.clientY >= pitchRect.top && e.clientY <= pitchRect.bottom
        if (onPitch) {
          onUpdateStarter(sideOf[playerId], playerId, true)
          // Position is already set in ghost's latest x/y via onMove
        } else {
          // Cancelled — remove ghost position
          setPositions((prev) => {
            const next = { ...prev }
            delete next[playerId]
            return next
          })
        }
        setGhost(null)
      } else {
        // Starter dragged — was it dropped on the subs panel?
        const subsRect = subsRef.current?.getBoundingClientRect()
        const onSubs = subsRect &&
          e.clientX >= subsRect.left && e.clientX <= subsRect.right &&
          e.clientY >= subsRect.top && e.clientY <= subsRect.bottom
        if (onSubs) {
          onUpdateStarter(sideOf[playerId], playerId, false)
        }
        setHoverSubs(false)
      }

      dragging.current = null
      setDraggedId(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [sideOf, onUpdateStarter])

  useImperativeHandle(ref, () => ({
    async exportPPTX() {
      const { exportPptx } = await import('../utils/exportPptx')
      await exportPptx({ match, positions, matchMode })
    },
  }), [match, positions, matchMode])

  function startSubDrag(player, e) {
    e.preventDefault()
    const rect = pitchRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100))
    dragging.current = { playerId: player.id, fromSubs: true }
    setDraggedId(player.id)
    setGhost({ player, x, y })
    // Pre-set position so it's ready if dropped
    setPositions((prev) => ({ ...prev, [player.id]: { x, y } }))
  }

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
              <span className="text-green-400 text-sm font-semibold">{homeTeam.formation}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Coach: <span className="text-gray-300">{homeTeam.coach}</span>
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
              <span className="text-green-400 text-sm font-semibold">{awayTeam.formation}</span>
              <span>{awayTeam.name}</span>
              <span>{awayTeam.flag}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Coach: <span className="text-gray-300">{awayTeam.coach}</span>
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
            // Subtle highlight when a sub is being dragged over the pitch
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

          {/* Starters */}
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
                  dragging.current = { playerId: player.id, fromSubs: false }
                  setDraggedId(player.id)
                }}
              >
                <PlayerCard
                  player={player}
                  compact={false}
                  onNoteChange={(note) => onNoteChange(sideOf[player.id], player.id, note)}
                />
              </div>
            )
          })}

          {/* Ghost: substitute being dragged onto the pitch */}
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

        {/* Substitutes — drop target when dragging a starter */}
        <div ref={subsRef}>
          <SubstitutesPanel
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            isDropTarget={hoverSubs}
            onSubDragStart={startSubDrag}
            onNoteChange={onNoteChange}
          />
        </div>
      </div>
    </div>
  )
})

export default Pitch
