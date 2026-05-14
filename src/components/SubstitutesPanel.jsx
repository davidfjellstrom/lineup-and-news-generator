import PlayerCard from './PlayerCard'

const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']

function groupSubs(team) {
  const subs = team.players.filter((p) => !p.isStarter)
  return POS_ORDER.map((pos) => ({
    pos,
    players: subs.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0)
}

function TeamSubs({ team }) {
  const groups = groupSubs(team)
  if (groups.length === 0) return null

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-gray-300">
          {team.flag} {team.name} — Substitutes
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-3">
        {groups.map(({ pos, players }) => (
          <div key={pos} className="flex items-start gap-2">
            <span
              className="text-xs font-bold mt-1 px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#9ca3af',
                minWidth: 28,
                textAlign: 'center',
              }}
            >
              {pos}
            </span>
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <PlayerCard key={player.id} player={player} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SubstitutesPanel({ homeTeam, awayTeam }) {
  return (
    <div
      className="flex gap-6 px-4 py-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      <TeamSubs team={homeTeam} />
      <div className="w-px bg-white/10 self-stretch" />
      <TeamSubs team={awayTeam} />
    </div>
  )
}
