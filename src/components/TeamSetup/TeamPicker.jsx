import { useState } from 'react'
import { WC2026_TEAMS } from '../../data/wc2026Teams'

export default function TeamPicker({ value, flag, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = query.trim()
    ? WC2026_TEAMS.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : WC2026_TEAMS

  function select(team) {
    onChange({ name: team.name.toUpperCase(), flag: team.flag })
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative flex-1 min-w-32">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer"
        style={{ background: '#374151' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xl">{flag || '🏳️'}</span>
        <span className="text-sm font-bold text-white flex-1 truncate">
          {value || 'Select team…'}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div
          className="absolute z-50 top-10 left-0 right-0 rounded-lg shadow-2xl overflow-hidden"
          style={{ background: '#1f2937', border: '1px solid #374151', minWidth: 220 }}
        >
          <div className="p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team…"
              className="w-full rounded px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-green-600"
              style={{ background: '#374151' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">No results</div>
            )}
            {filtered.map((team) => (
              <button
                key={team.name}
                onClick={() => select(team)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors"
              >
                <span className="text-lg">{team.flag}</span>
                <span className="text-white">{team.name}</span>
                <span className="ml-auto text-xs text-gray-500">Group {team.group}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
