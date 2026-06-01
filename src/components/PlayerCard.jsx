import { useRef, useEffect, useState } from 'react'

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

export default function PlayerCard({ player, compact = false, onNoteChange, onPhotoChange, isTop5 = false, teamColor = '#ffffff' }) {
  const photoSize = compact ? 38 : 56
  const badgeSize = compact ? 16 : 22
  const logoBadgeSize = compact ? 22 : 30
  const [dragOver, setDragOver] = useState(false)
  const fontSize = {
    first: compact ? 8 : 10,
    last: compact ? 9 : 13,
    club: compact ? 7 : 9,
    note: 9,
    stats: compact ? 7 : 10,
  }
  const notesRef = useRef(null)

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

  return (
    <div
      className="flex flex-col items-center select-none"
      style={{ maxWidth: compact ? 72 : 104 }}
    >
      {/* Photo area with badges */}
      <div
        className="relative flex-shrink-0"
        style={{ width: photoSize + 8, height: photoSize + 8 }}
      >
        {/* Jersey number badge */}
        <div
          className="absolute z-10 flex items-center justify-center rounded-full bg-white text-black font-bold shadow-md"
          style={{
            width: badgeSize,
            height: badgeSize,
            fontSize: badgeSize * 0.5,
            top: 0,
            left: 0,
          }}
        >
          {player.number}
        </div>

        {/* Photo circle — accepts file drops to set a custom photo */}
        <div
          className="absolute rounded-full border-2 overflow-hidden flex items-center justify-center"
          style={{
            width: photoSize,
            height: photoSize,
            top: 4,
            left: 4,
            background: '#6B7280',
            borderColor: dragOver ? '#4ade80' : teamColor,
            cursor: onPhotoChange ? 'copy' : 'default',
          }}
          onDragOver={onPhotoChange ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
          onDragLeave={onPhotoChange ? () => setDragOver(false) : undefined}
          onDrop={onPhotoChange ? handleDrop : undefined}
        >
          {player.photo ? (
            <img
              src={player.photo}
              alt={player.lastName}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <Silhouette size={photoSize} />
          )}
        </div>

        {/* Club logo badge */}
        {player.clubLogo && (
          <div
            className="absolute z-10 rounded-full bg-white overflow-hidden flex items-center justify-center shadow-md"
            style={{
              width: logoBadgeSize,
              height: logoBadgeSize,
              bottom: 0,
              right: 0,
            }}
          >
            <img
              src={player.clubLogo}
              alt={player.clubName}
              className="object-contain"
              style={{ width: logoBadgeSize * 0.8, height: logoBadgeSize * 0.8 }}
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
            />
          </div>
        )}
      </div>

      {/* Name */}
      <div
        className="text-center mt-1 leading-tight w-full"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
      >
        {player.firstName && (
          <div
            className="text-white/60 uppercase truncate"
            style={{ fontSize: fontSize.first }}
          >
            {player.firstName}
          </div>
        )}
        <div
          className="text-white font-bold uppercase truncate"
          style={{ fontSize: fontSize.last }}
        >
          {player.lastName || '—'}
        </div>
        {!player.clubLogo && player.clubName && (
          <div
            className="text-yellow-400 truncate"
            style={{ fontSize: fontSize.club }}
          >
            {player.clubName}
          </div>
        )}

        {/* Stats: position · age · height · foot */}
        {(player.positionLabel || player.age || player.height || player.foot) && (
          <div
            className="text-center truncate"
            style={{ fontSize: fontSize.stats, color: 'rgba(147,197,253,0.85)', marginTop: 1 }}
          >
            {[
              player.positionLabel,
              player.age ? `${player.age}å` : null,
              compact ? null : (player.height ? `${player.height}` : null),
              compact ? null : (player.foot ? `${player.foot}.f` : null),
            ].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* Caps / goals */}
        {!compact && player.caps > 0 && (
          <div
            className="text-center"
            style={{ fontSize: fontSize.stats, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}
          >
            {player.caps}/{player.goals ?? 0}
          </div>
        )}

        {/* Market value — only for top 5 */}
        {!compact && isTop5 && player.marketValue && (
          <div
            className="text-center font-semibold"
            style={{ fontSize: fontSize.stats, color: '#4ade80', marginTop: 1 }}
          >
            €{player.marketValue}M
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
            minWidth: compact ? 48 : 56,
            maxWidth: compact ? 68 : 88,
            marginTop: 2,
            lineHeight: '1.3',
          }}
          onBlur={(e) => onNoteChange(e.currentTarget.textContent)}
        />
      )}
    </div>
  )
}
