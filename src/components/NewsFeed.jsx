import { useState } from 'react'

const QUICK_FILTERS = ['FIFA World Cup 2026', 'UEFA', 'BBC Sport football', 'ESPN soccer', 'Sky Sports football']

const PLACEHOLDER_ARTICLES = [
  {
    source: 'FIFA',
    time: 'Just now',
    title: 'Welcome to the World Cup 2026 Lineup Generator',
    summary: 'Search for the latest match news, squad updates, and team previews using the search bar above.',
    url: '#',
  },
  {
    source: 'Tip',
    time: '',
    title: 'Use quick filter buttons for instant results',
    summary: 'Click a filter button below the search bar or type any team or tournament name to fetch live news via the Claude AI news feed.',
    url: '#',
  },
]

function ArticleCard({ article }) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-1"
      style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.18)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: '#166534', color: '#86efac' }}
        >
          {article.source}
        </span>
        {article.time && (
          <span className="text-xs text-gray-500">{article.time}</span>
        )}
      </div>
      <h3 className="text-white font-semibold text-sm leading-snug mt-1">
        {article.title}
      </h3>
      <p className="text-gray-400 text-xs leading-relaxed">{article.summary}</p>
      {article.url && article.url !== '#' && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-400 text-xs hover:text-green-300 mt-1 self-start"
        >
          Read →
        </a>
      )}
    </div>
  )
}

export default function NewsFeed() {
  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState(PLACEHOLDER_ARTICLES)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  async function doSearch(q) {
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/news?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setArticles(data.articles || [])
      setSearched(true)
    } catch (err) {
      setError(err.message)
      setArticles([])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') doSearch(query)
  }

  function quickFilter(label) {
    setQuery(label)
    doSearch(label)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold mb-4 text-white">Live News Feed</h2>

      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search football news…"
          className="flex-1 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-600"
          style={{ background: '#221e3a', border: '1px solid rgba(99,102,241,0.25)' }}
        />
        <button
          onClick={() => doSearch(query)}
          disabled={loading}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          style={{ background: loading ? '#374151' : 'linear-gradient(135deg, #4338ca, #7c3aed)', boxShadow: loading ? 'none' : '0 0 14px rgba(109,40,217,0.22)' }}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => quickFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors hover:text-white"
            style={{ background: 'transparent', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg p-4 mb-4 text-sm text-red-400"
          style={{ background: '#450a0a', border: '1px solid #991b1b' }}
        >
          <strong>Error:</strong> {error}
          {error.includes('ANTHROPIC_API_KEY') && (
            <span> — add your API key to <code>.env</code> and restart the API server.</span>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg p-4 animate-pulse"
              style={{ background: '#221e3a', height: 90 }}
            />
          ))}
        </div>
      )}

      {/* Articles */}
      {!loading && articles.length > 0 && (
        <div className="flex flex-col gap-3">
          {articles.map((article, i) => (
            <ArticleCard key={i} article={article} />
          ))}
        </div>
      )}

      {/* Empty state after search */}
      {!loading && searched && articles.length === 0 && !error && (
        <p className="text-gray-500 text-sm text-center py-8">
          No articles found. Try a different search query.
        </p>
      )}
    </div>
  )
}
