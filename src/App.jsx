import { useState } from 'react'
import Pitch from './components/Pitch'
import TeamSetup from './components/TeamSetup'
import NewsFeed from './components/NewsFeed'
const emptyMatch = {
  homeTeam: { name: '', flag: '', formation: '4-3-3', coach: '', players: [] },
  awayTeam: { name: '', flag: '', formation: '4-3-3', coach: '', players: [] },
  referee: '',
}

export default function App() {
  const [match, setMatch] = useState(emptyMatch)
  const [view, setView] = useState('setup') // 'setup' | 'pitch' | 'news'
  const [exporting, setExporting] = useState(false)

  function updatePlayerStarter(teamKey, playerId, isStarter) {
    setMatch((m) => ({
      ...m,
      [teamKey]: {
        ...m[teamKey],
        players: m[teamKey].players.map((p) =>
          p.id === playerId ? { ...p, isStarter } : p
        ),
      },
    }))
  }

  function updatePlayerNote(teamKey, playerId, note) {
    setMatch((m) => ({
      ...m,
      [teamKey]: {
        ...m[teamKey],
        players: m[teamKey].players.map((p) =>
          p.id === playerId ? { ...p, notes: note } : p
        ),
      },
    }))
  }

  async function exportPNG() {
    const el = document.getElementById('pitch-export')
    if (!el) return
    setExporting(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#111827',
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `${match.homeTeam.name.toLowerCase()}-vs-${match.awayTeam.name.toLowerCase()}-lineup.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const navBtn = (target, label) => (
    <button
      key={target}
      onClick={() => setView(target)}
      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: view === target ? '#16a34a' : 'transparent',
        color: view === target ? 'white' : '#9ca3af',
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen" style={{ background: '#111827' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
        style={{ background: '#1f2937', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">⚽</span>
          <span className="text-sm font-bold text-white hidden sm:block">
            World Cup 2026 · Lineup Generator
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {navBtn('setup', 'Setup')}
          {navBtn('pitch', 'Lineup')}
          {navBtn('news', 'News')}
        </nav>

        <div style={{ minWidth: 120 }} className="flex justify-end">
          {view === 'pitch' && (
            <button
              onClick={exportPNG}
              disabled={exporting}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#374151' }}
            >
              {exporting ? 'Exporting…' : '⬇ Export PNG'}
            </button>
          )}
        </div>
      </header>

      {/* ── Match info bar (pitch view) ── */}
      {view === 'pitch' && (
        <div
          className="flex items-center justify-center gap-3 px-4 py-2 text-xs text-gray-400"
          style={{ background: '#161e2a' }}
        >
          <span>{match.homeTeam.flag} {match.homeTeam.name}</span>
          <span className="text-gray-600">vs</span>
          <span>{match.awayTeam.flag} {match.awayTeam.name}</span>
        </div>
      )}

      {/* ── Views ── */}
      <main>
        {view === 'setup' && (
          <TeamSetup
            match={match}
            setMatch={setMatch}
            onViewLineup={() => setView('pitch')}
          />
        )}
        {view === 'pitch' && (
          <Pitch match={match} onNoteChange={updatePlayerNote} onUpdateStarter={updatePlayerStarter} />
        )}
        {view === 'news' && <NewsFeed />}
      </main>
    </div>
  )
}
