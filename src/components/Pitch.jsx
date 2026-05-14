import PlayerCard from './PlayerCard'
import SubstitutesPanel from './SubstitutesPanel'
import { groupIntoLines } from '../utils/formations'

// Field marking helpers
function HLine({ top, left, right, opacity = 0.25 }) {
  return (
    <div
      className="absolute"
      style={{
        top: `${top}%`,
        left: `${left}%`,
        right: `${right !== undefined ? `${100 - right}%` : undefined}`,
        height: 1,
        background: `rgba(255,255,255,${opacity})`,
      }}
    />
  )
}

function PenaltyBox({ side }) {
  const isHome = side === 'home'
  return (
    <>
      {/* Penalty area */}
      <div
        className="absolute"
        style={{
          top: '25%',
          height: '50%',
          width: '12%',
          ...(isHome ? { left: 0, borderRight: '1px solid rgba(255,255,255,0.28)', borderTop: '1px solid rgba(255,255,255,0.28)', borderBottom: '1px solid rgba(255,255,255,0.28)' }
                     : { right: 0, borderLeft: '1px solid rgba(255,255,255,0.28)', borderTop: '1px solid rgba(255,255,255,0.28)', borderBottom: '1px solid rgba(255,255,255,0.28)' }),
        }}
      />
      {/* Goal area */}
      <div
        className="absolute"
        style={{
          top: '37%',
          height: '26%',
          width: '5%',
          ...(isHome ? { left: 0, borderRight: '1px solid rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }
                     : { right: 0, borderLeft: '1px solid rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }),
        }}
      />
    </>
  )
}

function TeamColumns({ lines, side, onNoteChange }) {
  return (
    <div className="flex-1 flex min-h-0">
      {lines.map((line, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center justify-around py-3 px-1"
        >
          {line.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              compact={false}
              onNoteChange={(note) => onNoteChange(side, player.id, note)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Pitch({ match, onNoteChange }) {
  const { homeTeam, awayTeam, referee } = match

  const homeStarters = homeTeam.players.filter((p) => p.isStarter)
  const awayStarters = awayTeam.players.filter((p) => p.isStarter)

  const homeLines = groupIntoLines(homeStarters, homeTeam.formation)
  // Away team mirrored: reverse so GK appears on the far right
  const awayLinesDisplay = [...groupIntoLines(awayStarters, awayTeam.formation)].reverse()

  return (
    <div className="px-3 py-4 min-w-0">
      <div id="pitch-export" className="rounded-xl overflow-hidden" style={{ background: '#111827' }}>

        {/* ── Team headers ── */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: '#1f2937' }}>
          {/* Home */}
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

          {/* Referee */}
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-gray-500">Referee</div>
            <div className="text-sm text-gray-300 font-medium">{referee}</div>
          </div>

          {/* Away */}
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

        {/* ── Green pitch ── */}
        <div
          className="relative"
          style={{
            background: '#1a6b3c',
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0px, transparent 80px, rgba(0,0,0,0.07) 80px, rgba(0,0,0,0.07) 160px)',
            minHeight: 560,
            border: '2px solid rgba(255,255,255,0.15)',
          }}
        >
          {/* Field markings */}
          <PenaltyBox side="home" />
          <PenaltyBox side="away" />

          {/* Center line */}
          <div
            className="absolute top-0 bottom-0"
            style={{ left: '50%', width: 1, background: 'rgba(255,255,255,0.3)' }}
          />

          {/* Center circle */}
          <div
            className="absolute rounded-full"
            style={{
              width: 120,
              height: 120,
              border: '1px solid rgba(255,255,255,0.3)',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Center dot */}
          <div
            className="absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              background: 'rgba(255,255,255,0.55)',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Players — absolute overlay so they fill the pitch */}
          <div className="absolute inset-0 flex">
            <TeamColumns lines={homeLines} side="homeTeam" onNoteChange={onNoteChange} />
            <TeamColumns lines={awayLinesDisplay} side="awayTeam" onNoteChange={onNoteChange} />
          </div>
        </div>

        {/* ── Substitutes ── */}
        <SubstitutesPanel homeTeam={homeTeam} awayTeam={awayTeam} />
      </div>
    </div>
  )
}
