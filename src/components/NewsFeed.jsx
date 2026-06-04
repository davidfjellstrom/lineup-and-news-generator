import { useState } from 'react'
import { WC2026_TEAMS } from '../data/wc2026Teams'

const ALL_SOURCES = ['BBC Sport', 'Sky Sports', 'ESPN', 'FIFA', 'UEFA', 'The Guardian']

// Group teams by their WC group letter
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
        {article.time && (
          <span className="text-xs text-gray-500">{article.time}</span>
        )}
      </div>
      <h3 className="text-white font-semibold text-sm leading-snug mt-1">{article.title}</h3>
      <p className="text-gray-400 text-xs leading-relaxed">{article.summary}</p>
      {article.url && article.url !== '#' && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 text-xs hover:text-indigo-300 mt-1 self-start"
        >
          Läs mer →
        </a>
      )}
    </div>
  )
}

function SelectionChip({ label, flag, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
      style={{
        background: active ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'rgba(34,30,58,0.9)',
        border: `1px solid ${active ? 'transparent' : 'rgba(99,102,241,0.3)'}`,
        color: active ? 'white' : '#a5b4fc',
        boxShadow: active ? '0 0 14px rgba(109,40,217,0.3)' : 'none',
      }}
    >
      {flag && <span>{flag}</span>}
      <span>{label}</span>
    </button>
  )
}

export default function NewsFeed({ match }) {
  const [active, setActive] = useState(null) // { label, query }
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const [customQuery, setCustomQuery] = useState('')
  // Empty set = "Alla" (search all sources). Non-empty = only selected sources.
  const [selectedSources, setSelectedSources] = useState(new Set())

  function toggleSource(source) {
    setSelectedSources(prev => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  function toggleAll() {
    setSelectedSources(new Set()) // clear = search all
  }

  const allSelected = selectedSources.size === 0

  const homeTeam = match?.homeTeam
  const awayTeam = match?.awayTeam
  const hasMatch = homeTeam?.name && awayTeam?.name

  async function doSearch(query, selectionLabel) {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setSearched(false)
    setArticles([])
    setActive(selectionLabel)
    try {
      const sourcesParam = selectedSources.size > 0 ? [...selectedSources].join(',') : ''
      const url = `/api/news?q=${encodeURIComponent(query)}${sourcesParam ? `&sources=${encodeURIComponent(sourcesParam)}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setArticles(data.articles || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* Current match shortcuts */}
      {hasMatch && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #4338ca, #7c3aed)' }} />
            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Aktuell match</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <SelectionChip
              flag={homeTeam.flag}
              label={homeTeam.name}
              active={active === homeTeam.name}
              onClick={() => doSearch(`${homeTeam.name} national football team World Cup 2026`, homeTeam.name)}
            />
            <SelectionChip
              label="vs"
              active={active === `${homeTeam.name} vs ${awayTeam.name}`}
              onClick={() => doSearch(`${homeTeam.name} vs ${awayTeam.name} World Cup 2026`, `${homeTeam.name} vs ${awayTeam.name}`)}
            />
            <SelectionChip
              flag={awayTeam.flag}
              label={awayTeam.name}
              active={active === awayTeam.name}
              onClick={() => doSearch(`${awayTeam.name} national football team World Cup 2026`, awayTeam.name)}
            />
          </div>
        </div>
      )}

      {/* Search bar + source filters */}
      <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(customQuery, customQuery)}
          placeholder="Sök valfritt lag, spelare eller ämne…"
          className="flex-1 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
          style={{ background: 'rgba(34,30,58,0.9)', border: '1px solid rgba(99,102,241,0.25)' }}
        />
        <button
          onClick={() => doSearch(customQuery, customQuery)}
          disabled={loading || !customQuery.trim()}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)', boxShadow: '0 0 14px rgba(109,40,217,0.22)' }}
        >
          Sök
        </button>
      </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-gray-500 uppercase tracking-widest mr-1">Källor:</span>
          <button
            onClick={toggleAll}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              background: allSelected ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'transparent',
              border: `1px solid ${allSelected ? 'transparent' : 'rgba(99,102,241,0.35)'}`,
              color: allSelected ? 'white' : '#a5b4fc',
            }}
          >
            Alla
          </button>
          {ALL_SOURCES.map(source => {
            const on = selectedSources.has(source)
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
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
      </div>

      {/* All WC 2026 teams */}
      <div
        className="rounded-xl p-4"
        style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}
      >
        <div className="flex items-center gap-2 mb-4 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #4338ca, #7c3aed)' }} />
          <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Alla VM-lag 2026</span>
        </div>
        <div className="flex flex-col gap-4">
          {Object.entries(GROUPS).sort().map(([group, teams]) => (
            <div key={group}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Grupp {group}</div>
              <div className="flex flex-wrap gap-2">
                {teams.map((team) => (
                  <SelectionChip
                    key={team.name}
                    flag={team.flag}
                    label={team.name}
                    active={active === team.name}
                    onClick={() => doSearch(`${team.name} national football team World Cup 2026`, team.name)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg p-4 animate-pulse" style={{ background: '#221e3a', height: 90 }} />
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-4 text-sm text-red-400"
          style={{ background: '#2a0a0a', border: '1px solid #991b1b' }}
        >
          <strong>Fel:</strong> {error}
        </div>
      )}

      {!loading && searched && articles.length === 0 && !error && (
        <div
          className="rounded-lg p-6 text-center text-gray-400 text-sm"
          style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}
        >
          Inga nyheter hittades om <span className="text-white font-semibold">{active}</span>.
        </div>
      )}

      {!loading && articles.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #4338ca, #7c3aed)' }} />
            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
              {articles.length} nyheter om {active}
            </span>
          </div>
          {articles.map((article, i) => (
            <ArticleCard key={i} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
