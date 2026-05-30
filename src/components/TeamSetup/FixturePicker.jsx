import { useState, useEffect, useRef } from 'react'

function formatFixtureDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function FixturePicker({ teamName, onSelect, autoSelectFixtureId }) {
  const [fixtures, setFixtures] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const autoIdRef = useRef(null)

  useEffect(() => {
    if (!autoSelectFixtureId || !teamName.trim()) return
    autoIdRef.current = autoSelectFixtureId
    loadFixtures()
  }, [autoSelectFixtureId, teamName])

  useEffect(() => {
    if (!autoIdRef.current || !fixtures) return
    const match = fixtures.find((f) => f.fixtureId === autoIdRef.current)
    if (match) {
      setSelected(match)
      onSelect(match)
    }
  }, [fixtures])

  async function loadFixtures() {
    if (!teamName.trim()) return
    setLoading(true)
    setError(null)
    setFixtures(null)
    setSelected(null)
    try {
      const res = await fetch(`/api/fixtures?team=${encodeURIComponent(teamName)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setFixtures(data.fixtures || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(fixture) {
    setSelected(fixture)
    onSelect(fixture)
  }

  return (
    <div
      className="mb-4 rounded-lg p-3"
      style={{ background: 'rgba(20,83,45,0.2)', border: '1px solid rgba(22,163,74,0.3)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Välj match</span>
        <button
          onClick={loadFixtures}
          disabled={loading || !teamName.trim()}
          className="text-xs px-3 py-1 rounded-lg text-white disabled:opacity-40 transition-colors"
          style={{ background: loading ? '#374151' : '#15803d' }}
        >
          {loading ? '⟳ Söker…' : fixtures === null ? 'Hämta matcher' : '↺ Uppdatera'}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      {fixtures !== null && fixtures.length === 0 && (
        <p className="text-gray-500 text-xs">Inga matcher hittades för {teamName} i VM 2026.</p>
      )}

      {fixtures && fixtures.length > 0 && (
        <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
          {fixtures.map((f) => {
            const isSelected = selected?.fixtureId === f.fixtureId
            return (
              <button
                key={f.fixtureId}
                onClick={() => handleSelect(f)}
                className="w-full text-left rounded px-2 py-1.5 text-xs transition-colors"
                style={{
                  background: isSelected ? 'rgba(22,163,74,0.3)' : 'rgba(255,255,255,0.05)',
                  border: isSelected ? '1px solid #16a34a' : '1px solid transparent',
                  color: isSelected ? '#86efac' : '#d1d5db',
                }}
              >
                <span className="font-semibold">{f.home} vs {f.away}</span>
                <span className="ml-2 text-gray-500">{formatFixtureDate(f.date)}</span>
                {f.status !== 'NS' && (
                  <span className="ml-2 text-yellow-400">{f.status}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <p className="text-green-400 text-xs mt-2">
          ✓ Vald: {selected.home} vs {selected.away} · {formatFixtureDate(selected.date)}
        </p>
      )}
    </div>
  )
}
