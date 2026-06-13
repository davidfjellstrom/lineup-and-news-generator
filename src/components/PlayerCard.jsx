import { useRef, useEffect, useState } from 'react'

const _canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

function fitFontSize(text, basePx, maxWidthPx) {
  if (!text?.length || !_canvas) return basePx
  const ctx = _canvas.getContext('2d')
  ctx.font = `bold ${basePx}px ui-sans-serif, system-ui, -apple-system, sans-serif`
  const w = ctx.measureText(text).width
  if (w <= maxWidthPx) return basePx
  return Math.max(8, (basePx * maxWidthPx) / w)
}

function statsColorFromTeamColor(hex) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 'rgba(147,197,253,0.85)'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const isGreen = g > r * 1.2 && g > b * 1.2 && g > 100
  if (isGreen) return 'rgba(255,255,255,0.85)'
  return `rgba(${r},${g},${b},0.85)`
}


const Silhouette = ({ size }) => (
  <svg
    viewBox="0 0 24 24"
    style={{ width: size * 0.6, height: size * 0.6 }}
    fill="currentColor"
    className="text-gray-400"
  >
    <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 10c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" />
  </svg>
)

export default function PlayerCard({ player, compact = false, onNoteChange, onPhotoChange, onPlayerChange, isTop5 = false, teamColor = '#ffffff' }) {
  const photoSize = 56
  const badgeSize = 22
  const logoBadgeSize = 30
  const [dragOver, setDragOver] = useState(false)
  const [hoverStats, setHoverStats] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const fontSize = { first: 10, last: 13, club: 9, note: 9, stats: 10 }
  const notesRef = useRef(null)
  const statsColor = statsColorFromTeamColor(teamColor)

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!onPhotoChange) return
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => onPhotoChange(ev.target.result)
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (notesRef.current && notesRef.current !== document.activeElement) {
      notesRef.current.textContent = player.notes || ''
    }
  }, [player.notes])

  function openEdit(e) {
    e.stopPropagation()
    e.preventDefault()
    setDraft({
      positionLabel: player.positionLabel || '',
      age: player.age != null ? String(player.age) : '',
      height: player.height != null ? String(player.height) : '',
      foot: player.foot || '',
      caps: player.caps != null ? String(player.caps) : '',
      goals: player.goals != null ? String(player.goals) : '',
      marketValue: player.marketValue != null ? String(player.marketValue) : '',
    })
    setEditing(true)
  }

  function commitEdit(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setEditing(false)
    onPlayerChange?.({
      positionLabel: draft.positionLabel || null,
      age: draft.age !== '' ? Number(draft.age) : null,
      height: draft.height !== '' ? Number(draft.height) : null,
      foot: draft.foot || null,
      caps: draft.caps !== '' ? Number(draft.caps) : null,
      goals: draft.goals !== '' ? Number(draft.goals) : null,
      marketValue: draft.marketValue !== '' ? parseFloat(draft.marketValue) : null,
    })
  }

  const up = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }))

  const inputBase = {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.25)',
    color: statsColor,
    fontSize: 9,
    outline: 'none',
    textAlign: 'center',
    padding: '0 1px',
    minWidth: 0,
    width: '100%',
  }
  const selectBase = { ...inputBase, cursor: 'pointer', background: 'rgba(0,0,0,0.4)' }

  return (
    <div className="flex flex-col items-center select-none" style={{ maxWidth: 104 }}>
      {/* Photo area */}
      <div className="relative flex-shrink-0" style={{ width: photoSize + 8, height: photoSize + 8 }}>
        <div
          className="absolute z-10 flex items-center justify-center rounded-full bg-white text-black font-bold shadow-md"
          style={{ width: badgeSize, height: badgeSize, fontSize: badgeSize * 0.625, top: 0, left: 0, border: `1px solid ${teamColor}` }}
        >
          {player.number}
        </div>
        <div
          className="absolute rounded-full border-2 overflow-hidden flex items-center justify-center"
          style={{
            width: photoSize, height: photoSize, top: 4, left: 4,
            background: '#6B7280', borderColor: dragOver ? '#4ade80' : teamColor,
            cursor: onPhotoChange ? 'copy' : 'default',
          }}
          onDragOver={onPhotoChange ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
          onDragLeave={onPhotoChange ? () => setDragOver(false) : undefined}
          onDrop={onPhotoChange ? handleDrop : undefined}
        >
          {player.photo ? (
            <img src={player.photo} alt={player.lastName} className="w-full h-full object-cover" crossOrigin="anonymous" />
          ) : (
            <Silhouette size={photoSize} />
          )}
        </div>
        {player.clubLogo && (
          <div
            className="absolute z-10 rounded-full bg-white overflow-hidden flex items-center justify-center shadow-md"
            style={{ width: logoBadgeSize, height: logoBadgeSize, bottom: 0, right: 0, border: '1px solid #000' }}
          >
            <img
              src={player.clubLogo} alt={player.clubName} className="object-contain"
              style={{ width: logoBadgeSize * 0.8, height: logoBadgeSize * 0.8 }}
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
            />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-center mt-1 leading-tight w-full" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}>
        {player.firstName && (
          <div className="text-white/60 uppercase" style={{ fontSize: fontSize.first }}>
            {player.firstName}
          </div>
        )}
        <div className="relative flex items-center justify-center">
          <div className="text-white font-bold uppercase" style={{ fontSize: fitFontSize(player.lastName, fontSize.last, 100) }}>
            {player.lastName || '—'}
          </div>
          {onPlayerChange && (
            <button
              onClick={openEdit}
              onMouseDown={(e) => e.stopPropagation()}
              title="Redigera spelarinfo"
              className="absolute"
              style={{
                right: 0,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)', fontSize: 10, padding: 0,
                lineHeight: 1,
                opacity: hoverStats ? 1 : 0,
                transition: 'opacity 0.15s',
                pointerEvents: hoverStats ? 'auto' : 'none',
              }}
            >
              ✎
            </button>
          )}
        </div>
        {!player.clubLogo && player.clubName && (
          <div className="text-yellow-400 truncate" style={{ fontSize: fontSize.club }}>
            {player.clubName}
          </div>
        )}

        {/* Stats — display mode */}
        {!editing && (
          <div
            className="relative"
            onMouseEnter={() => onPlayerChange && setHoverStats(true)}
            onMouseLeave={() => setHoverStats(false)}
          >
            {(player.positionLabel || player.age || player.height || player.foot) && (
              <div className="text-center truncate" style={{ fontSize: fontSize.stats, color: statsColor, marginTop: 1 }}>
                {[
                  player.positionLabel,
                  player.age ? `${player.age}å` : null,
                  compact ? null : (player.height ? `${player.height}` : null),
                  compact ? null : (player.foot ? `${player.foot}.f` : null),
                ].filter(Boolean).join(' · ')}
              </div>
            )}
            {(player.caps > 0 || (!compact && isTop5 && player.marketValue)) && (
              <div className="text-center" style={{ fontSize: fontSize.stats, marginTop: 1 }}>
                {player.caps > 0 && (
                  <span style={{ color: '#4ade80' }}>{player.caps}/{player.goals ?? 0}</span>
                )}
                {!compact && player.caps > 0 && isTop5 && player.marketValue && (
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}> · </span>
                )}
                {!compact && isTop5 && player.marketValue && (
                  <span className="font-bold" style={{ color: '#fb923c' }}>€{player.marketValue}M</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats — edit mode */}
        {editing && (
          <div
            onBlur={commitEdit}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: 2 }}
          >
            {/* Row 1: positionLabel, age, height, foot */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 2fr', gap: 2 }}>
              <input
                value={draft.positionLabel}
                onChange={up('positionLabel')}
                placeholder="Pos"
                autoFocus
                style={inputBase}
              />
              <input
                value={draft.age}
                onChange={up('age')}
                placeholder="Åld"
                type="number"
                style={inputBase}
              />
              <input
                value={draft.height}
                onChange={up('height')}
                placeholder="cm"
                type="number"
                style={inputBase}
              />
              <select value={draft.foot} onChange={up('foot')} style={selectBase}>
                <option value="">—</option>
                <option value="Hö">Hö.f</option>
                <option value="Vä">Vä.f</option>
                <option value="Bå">Bå.f</option>
              </select>
            </div>
            {/* Row 2: caps, goals, marketValue */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr auto 1.5fr auto 2fr', gap: 2, marginTop: 3, alignItems: 'center' }}>
              <input
                value={draft.caps}
                onChange={up('caps')}
                placeholder="M"
                type="number"
                style={{ ...inputBase, color: '#4ade80' }}
              />
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>/</span>
              <input
                value={draft.goals}
                onChange={up('goals')}
                placeholder="G"
                type="number"
                style={{ ...inputBase, color: '#4ade80' }}
              />
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>€</span>
              <input
                value={draft.marketValue}
                onChange={up('marketValue')}
                placeholder="M"
                type="number"
                style={{ ...inputBase, color: '#fb923c' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Editable notes */}
      {onNoteChange && (
        <div
          ref={notesRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Add note…"
          className="text-center italic outline-none cursor-text rounded px-0.5"
          style={{
            fontSize: fontSize.note,
            color: 'rgba(255,255,230,0.85)',
            width: '100%',
            marginTop: 2,
            lineHeight: '1.3',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          onBlur={(e) => onNoteChange(e.currentTarget.textContent)}
        />
      )}
    </div>
  )
}
