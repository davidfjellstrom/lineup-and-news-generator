import PlayerCard from './PlayerCard'

const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']

function groupSubs(team) {
  const subs = team.players.filter((p) => !p.isStarter)
  return POS_ORDER.map((pos) => ({
    pos,
    players: subs.filter((p) => p.position === pos),
  }))
}

function TeamSubs({ team, isDropTarget, onSubDragStart, onNoteChange }) {
  const groups = groupSubs(team)
  const hasAnySub = groups.some((g) => g.players.length > 0)
  if (!hasAnySub) return null

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-gray-300">
          {team.flag} {team.name} — Substitutes
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map(({ pos, players }) => (
          <div key={pos} className="flex items-center gap-2 min-h-[52px]">
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded self-start mt-1"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#9ca3af',
                minWidth: 32,
                textAlign: 'center',
              }}
            >
              {pos}
            </span>
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  style={{ cursor: 'grab' }}
                  onMouseDown={(e) => onSubDragStart(player, e)}
                >
                  <PlayerCard
                    player={player}
                    compact
                    onNoteChange={onNoteChange ? (note) => onNoteChange(player.id, note) : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SubstitutesPanel({ homeTeam, awayTeam, isDropTarget, onSubDragStart, onNoteChange }) {
  return (
    <div
      className="flex gap-6 px-4 py-4 transition-colors"
      style={{
        background: isDropTarget ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.35)',
        outline: isDropTarget ? '2px solid rgba(34,197,94,0.5)' : 'none',
      }}
    >
      <TeamSubs team={homeTeam} isDropTarget={isDropTarget} onSubDragStart={onSubDragStart} onNoteChange={onNoteChange ? (id, note) => onNoteChange('homeTeam', id, note) : undefined} />
      <div className="w-px bg-white/10 self-stretch" />
      <TeamSubs team={awayTeam} isDropTarget={isDropTarget} onSubDragStart={onSubDragStart} onNoteChange={onNoteChange ? (id, note) => onNoteChange('awayTeam', id, note) : undefined} />
    </div>
  )
}
