const POSITIONS = ['GK', 'DEF', 'MID', 'FWD']

export default function PlayerRow({ player, side, updatePlayer, deletePlayer }) {
  const up = (field, val) => updatePlayer(side, player.id, { [field]: val })

  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      <td className="px-1 py-1">
        <input
          type="number"
          value={player.number}
          onChange={(e) => up('number', parseInt(e.target.value) || '')}
          className="w-10 bg-transparent text-center text-white text-xs outline-none rounded focus:ring-1 focus:ring-green-600"
          min={1}
          max={99}
        />
      </td>
      <td className="px-1 py-1">
        <select
          value={player.position}
          onChange={(e) => up('position', e.target.value)}
          className="bg-gray-700 text-white text-xs rounded px-1 py-0.5 outline-none"
        >
          {POSITIONS.map((p) => <option key={p}>{p}</option>)}
        </select>
      </td>
      <td className="px-1 py-1">
        <input
          value={player.firstName}
          onChange={(e) => up('firstName', e.target.value.toUpperCase())}
          placeholder="FIRST"
          className="w-20 bg-transparent text-white text-xs outline-none rounded px-1 focus:ring-1 focus:ring-green-600"
        />
      </td>
      <td className="px-1 py-1">
        <input
          value={player.lastName}
          onChange={(e) => up('lastName', e.target.value.toUpperCase())}
          placeholder="LAST"
          className="w-24 bg-transparent text-white text-xs outline-none rounded px-1 focus:ring-1 focus:ring-green-600"
        />
      </td>
      <td className="px-1 py-1">
        <input
          value={player.clubName}
          onChange={(e) => up('clubName', e.target.value)}
          placeholder="Club"
          className="w-24 bg-transparent text-white text-xs outline-none rounded px-1 focus:ring-1 focus:ring-green-600"
        />
      </td>
      <td className="px-1 py-1">
        <div className="flex items-center justify-center">
          {player.clubLogo ? (
            <img
              src={player.clubLogo}
              alt=""
              title={player.clubLogo}
              style={{ width: 22, height: 22, objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div className="text-gray-600 text-xs">—</div>
          )}
        </div>
      </td>
      <td className="px-1 py-1 text-center">
        <button
          onClick={() => deletePlayer(side, player.id)}
          className="text-red-500 hover:text-red-400 text-xs px-1"
          title="Delete"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}
