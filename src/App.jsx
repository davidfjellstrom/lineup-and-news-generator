import { useState, useRef, useEffect } from 'react'
import Pitch from './components/Pitch'
import TeamSetup from './components/TeamSetup'
import NewsFeed from './components/NewsFeed'
const emptyTeam = { name: '', flag: '', formation: '4-3-3', coach: '', players: [], fifaRanking: null, avgAge: null, squadValue: null }
const emptyMatch = {
  homeTeam: { ...emptyTeam },
  awayTeam: { ...emptyTeam },
  referee: '',
}

const STORAGE_KEY = 'wc2026-match'

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  const [match, setMatch] = useState(() => loadSaved() || emptyMatch)
  const VALID_VIEWS = ['setup', 'pitch', 'news']
  const hashView = window.location.hash.replace('#', '')
  const [view, setView] = useState(VALID_VIEWS.includes(hashView) ? hashView : 'setup')
  const [exporting, setExporting] = useState(false)
  const [matchMode, setMatchMode] = useState('pre-match') // 'pre-match' | 'match'
  const pitchRef = useRef(null)

  useEffect(() => {
    window.location.hash = view
  }, [view])
  const [exportingPptx, setExportingPptx] = useState(false)
  const [exportError, setExportError] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(match))
    } catch {
      // localStorage kan vara otillgänglig (t.ex. iOS privat läge med full kvot)
    }
  }, [match])

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

  function updateFormation(teamKey, formation) {
    setMatch((m) => ({ ...m, [teamKey]: { ...m[teamKey], formation } }))
  }

  function updatePlayerPhoto(teamKey, playerId, photo) {
    setMatch((m) => ({
      ...m,
      [teamKey]: {
        ...m[teamKey],
        players: m[teamKey].players.map((p) =>
          p.id === playerId ? { ...p, photo } : p
        ),
      },
    }))
  }

  async function exportPPTX() {
    if (!pitchRef.current) return
    setExportingPptx(true)
    setExportError(null)
    try {
      await pitchRef.current.exportPPTX()
    } catch (err) {
      console.error('PPTX export failed:', err)
      setExportError('PPTX-export misslyckades. Försök igen.')
    } finally {
      setExportingPptx(false)
    }
  }

  async function exportPNG() {
    const el = document.getElementById('pitch-export')
    if (!el) return
    setExporting(true)
    setExportError(null)
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
      setExportError('PNG-export misslyckades. Försök igen.')
    } finally {
      setExporting(false)
    }
  }

  function newMatch() {
    if (!window.confirm('Starta en ny match? All nuvarande data rensas.')) return
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('wc2026-positions')
    setMatch({ ...emptyMatch, homeTeam: { ...emptyTeam }, awayTeam: { ...emptyTeam } })
    setView('setup')
  }

  const navBtn = (target, label) => (
    <button
      key={target}
      onClick={() => setView(target)}
      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: view === target ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'transparent',
        color: view === target ? 'white' : '#9ca3af',
        boxShadow: view === target ? '0 0 14px rgba(109,40,217,0.22)' : 'none',
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #2d1b69 60%, #4a1080 100%)' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-5"
        style={{ background: 'linear-gradient(135deg, #1e1b6e 0%, #4c1994 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-white hidden sm:block"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '1.5rem', fontWeight: 700, fontStyle: 'italic', letterSpacing: '0.07em', lineHeight: 1 }}
          >
            LINEUP &amp; NEWS GENERATOR
          </span>
          <button
            onClick={newMatch}
            className="text-xs px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Rensa allt och börja om"
          >
            + Ny match
          </button>
        </div>

        <nav className="flex items-center gap-1">
          {navBtn('setup', 'Setup')}
          {navBtn('pitch', 'Lineup')}
          {navBtn('news', 'News')}
        </nav>

        <div style={{ minWidth: 120 }} className="flex justify-end items-center gap-2">
          {/* Match mode toggle */}
          <div
            className="flex items-center rounded-lg overflow-hidden text-xs font-semibold"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <button
              onClick={() => setMatchMode('pre-match')}
              className="px-3 py-1.5 transition-colors"
              style={{
                background: matchMode === 'pre-match' ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'transparent',
                color: matchMode === 'pre-match' ? 'white' : '#6b7280',
                boxShadow: matchMode === 'pre-match' ? '0 0 12px rgba(109,40,217,0.22)' : 'none',
              }}
            >
              Pre-match
            </button>
            <button
              onClick={() => setMatchMode('match')}
              className="px-3 py-1.5 transition-colors"
              style={{
                background: matchMode === 'match' ? '#14532d' : 'transparent',
                color: matchMode === 'match' ? '#86efac' : '#6b7280',
              }}
            >
              Match
            </button>
          </div>

          {view === 'pitch' && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <button
                  onClick={exportPNG}
                  disabled={exporting}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: '#374151' }}
                >
                  {exporting ? 'Exporting…' : '⬇ PNG'}
                </button>
                <button
                  onClick={exportPPTX}
                  disabled={exportingPptx}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: '#374151' }}
                >
                  {exportingPptx ? 'Exporting…' : '⬇ PPTX'}
                </button>
              </div>
              {exportError && (
                <p className="text-red-400 text-xs">{exportError}</p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Match info bar (pitch view) ── */}
      {view === 'pitch' && (
        <div
          className="flex items-center justify-center gap-3 px-4 py-2 text-xs font-medium tracking-wider"
          style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)', color: 'rgba(255,255,255,0.8)', borderTop: '0.5px solid #ffffff', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span>{match.homeTeam.flag} {match.homeTeam.name}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>vs</span>
          <span>{match.awayTeam.flag} {match.awayTeam.name}</span>
        </div>
      )}

      {/* ── Views ── */}
      <main>
        {view === 'setup' && (
          <TeamSetup
            match={match}
            setMatch={setMatch}
            matchMode={matchMode}
            onViewLineup={() => setView('pitch')}
          />
        )}
        <div style={{ display: view === 'pitch' ? undefined : 'none' }}>
          <Pitch ref={pitchRef} match={match} matchMode={matchMode} onNoteChange={updatePlayerNote} onPhotoChange={updatePlayerPhoto} onUpdateStarter={updatePlayerStarter} onFormationChange={updateFormation} />
        </div>
        {view === 'news' && <NewsFeed match={match} />}
      </main>
    </div>
  )
}
