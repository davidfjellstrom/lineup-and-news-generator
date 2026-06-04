import { useState } from 'react'
import { WC2026_TEAMS } from '../data/wc2026Teams'

const ALL_SOURCES = ['BBC Sport', 'Sky Sports', 'ESPN', 'FIFA', 'UEFA', 'The Guardian']

const GROUPS = WC2026_TEAMS.reduce((acc, team) => {
  if (!acc[team.group]) acc[team.group] = []
  acc[team.group].push(team)
  return acc
}, {})

function ArticleCard({ article }) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-1"
      style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc' }}
        >
          {article.source}
        </span>
        {article.time && <span className="text-xs text-gray-500">{article.time}</span>}
      </div>
      <h3 className="text-white font-semibold text-sm leading-snug mt-1">{article.title}</h3>
      <p className="text-gray-400 text-xs leading-relaxed">{article.summary}</p>
      {article.url && article.url !== '#' && (
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          className="text-indigo-400 text-xs hover:text-indigo-300 mt-1 self-start">
          Läs mer →
        </a>
      )}
    </div>
  )
}

function SourceFilters({ selected, onToggle, onToggleAll }) {
  const allSelected = selected.size === 0
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-widest">Källor:</span>
      <button
        onClick={onToggleAll}
        className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
        style={{
          background: allSelected ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'transparent',
          border: `1px solid ${allSelected ? 'transparent' : 'rgba(99,102,241,0.25)'}`,
          color: allSelected ? 'white' : 'rgba(165,180,252,0.5)',
        }}
      >
        Alla
      </button>
      {ALL_SOURCES.map(source => {
        const on = selected.has(source)
        return (
          <button key={source} onClick={() => onToggle(source)}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              background: on ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'transparent',
              border: `1px solid ${on ? 'transparent' : 'rgba(99,102,241,0.25)'}`,
              color: on ? 'white' : 'rgba(165,180,252,0.5)',
              boxShadow: on ? '0 0 10px rgba(109,40,217,0.25)' : 'none',
            }}
          >
            {source}
          </button>
        )
      })}
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #4338ca, #7c3aed)' }} />
      <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">{title}</span>
    </div>
  )
}

function ResultsBlock({ loading, error, searched, articles, activeLabel }) {
  if (!loading && !searched && !error) return null
  return (
    <div className="flex flex-col gap-3 mt-4">
      {loading && [1, 2, 3].map(i => (
        <div key={i} className="rounded-lg p-4 animate-pulse" style={{ background: '#221e3a', height: 90 }} />
      ))}
      {error && (
        <div className="rounded-lg p-4 text-sm text-red-400" style={{ background: '#2a0a0a', border: '1px solid #991b1b' }}>
          <strong>Fel:</strong> {error}
        </div>
      )}
      {!loading && searched && articles.length === 0 && !error && (
        <div className="rounded-lg p-6 text-center text-gray-400 text-sm"
          style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}>
          Inga nyheter hittades om <span className="text-white font-semibold">{activeLabel}</span>.
        </div>
      )}
      {!loading && articles.map((a, i) => <ArticleCard key={i} article={a} />)}
    </div>
  )
}

function useNewsSearch() {
  const [sources, setSources] = useState(new Set())
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const [activeLabel, setActiveLabel] = useState('')

  function toggleSource(s) {
    setSources(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }
  function toggleAll() { setSources(new Set()) }

  async function search(query, label) {
    if (!query.trim()) return
    setLoading(true); setError(null); setSearched(false); setArticles([]); setActiveLabel(label)
    try {
      const sp = sources.size > 0 ? `&sources=${encodeURIComponent([...sources].join(','))}` : ''
      const res = await fetch(`/api/news?q=${encodeURIComponent(query)}${sp}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`)
      setArticles((await res.json()).articles || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false); setSearched(true)
    }
  }

  return { sources, toggleSource, toggleAll, articles, loading, error, searched, activeLabel, search }
}

export default function NewsFeed({ match }) {
  const matchSearch = useNewsSearch()
  const teamSearch = useNewsSearch()
  const [customQuery, setCustomQuery] = useState('')

  const homeTeam = match?.homeTeam
  const awayTeam = match?.awayTeam
  const hasMatch = homeTeam?.name && awayTeam?.name

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* ── Section 1: Aktuell match ── */}
      {hasMatch && (
        <div className="rounded-xl p-4" style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}>
          <SectionHeader title="Aktuell match" />
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { flag: homeTeam.flag, label: homeTeam.name, query: `${homeTeam.name} national football team World Cup 2026` },
              { label: 'vs', query: `${homeTeam.name} vs ${awayTeam.name} World Cup 2026` },
              { flag: awayTeam.flag, label: awayTeam.name, query: `${awayTeam.name} national football team World Cup 2026` },
            ].map(({ flag, label, query }) => (
              <button key={label} onClick={() => matchSearch.search(query, label)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: matchSearch.activeLabel === label && matchSearch.searched ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'rgba(34,30,58,0.9)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  color: '#a5b4fc',
                }}
              >
                {flag && <span>{flag}</span>}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <SourceFilters selected={matchSearch.sources} onToggle={matchSearch.toggleSource} onToggleAll={matchSearch.toggleAll} />
          <button
            onClick={() => matchSearch.search(`${homeTeam.name} vs ${awayTeam.name} World Cup 2026`, `${homeTeam.name} vs ${awayTeam.name}`)}
            disabled={matchSearch.loading}
            className="mt-4 w-full py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)', boxShadow: '0 0 14px rgba(109,40,217,0.22)' }}
          >
            {matchSearch.loading ? 'Hämtar…' : `Sök nyheter om ${homeTeam.name} vs ${awayTeam.name}`}
          </button>
          <ResultsBlock {...matchSearch} />
        </div>
      )}

      {/* ── Section 2: Lag & ämnen ── */}
      <div className="rounded-xl p-4" style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}>
        <SectionHeader title="Sök lag & ämnen" />

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={customQuery}
            onChange={e => setCustomQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && teamSearch.search(customQuery, customQuery)}
            placeholder="Sök valfritt lag, spelare eller ämne…"
            className="flex-1 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
            style={{ background: 'rgba(15,12,41,0.6)', border: '1px solid rgba(99,102,241,0.25)' }}
          />
          <button
            onClick={() => teamSearch.search(customQuery, customQuery)}
            disabled={teamSearch.loading || !customQuery.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)', boxShadow: '0 0 14px rgba(109,40,217,0.22)' }}
          >
            Sök
          </button>
        </div>

        <SourceFilters selected={teamSearch.sources} onToggle={teamSearch.toggleSource} onToggleAll={teamSearch.toggleAll} />

        <div className="flex flex-col gap-4 mt-4">
          {Object.entries(GROUPS).sort().map(([group, teams]) => (
            <div key={group}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Grupp {group}</div>
              <div className="flex flex-wrap gap-2">
                {teams.map(team => (
                  <button key={team.name}
                    onClick={() => teamSearch.search(`${team.name} national football team World Cup 2026`, team.name)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: teamSearch.activeLabel === team.name && teamSearch.searched ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'rgba(15,12,41,0.5)',
                      border: '1px solid rgba(99,102,241,0.25)',
                      color: '#a5b4fc',
                    }}
                  >
                    <span>{team.flag}</span>
                    <span>{team.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <ResultsBlock {...teamSearch} />
      </div>
    </div>
  )
}
