import { useState, useRef, useEffect } from 'react'

/**
 * Manages drag-and-drop for pitch players and substitutes.
 *
 * Returns refs that must be attached to the pitch element and the subs panel:
 *   <div ref={pitchRef}>...</div>
 *   <div ref={subsRef}>...</div>
 *
 * @param {object} opts
 * @param {function} opts.onUpdateStarter - (side, playerId, isStarter) => void
 * @param {object}   opts.sideOf          - { [playerId]: 'homeTeam'|'awayTeam' }
 * @param {function} opts.setPositions    - React setState for { [playerId]: {x, y} }
 */
export function useDragAndDrop({ onUpdateStarter, sideOf, setPositions }) {
  const [draggedId, setDraggedId] = useState(null)
  const [ghost, setGhost] = useState(null)       // { player, x, y }
  const [hoverSubs, setHoverSubs] = useState(false)

  const dragging = useRef(null)  // { playerId, fromSubs }
  const pitchRef = useRef(null)
  const subsRef = useRef(null)

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current || !pitchRef.current) return
      const rect = pitchRef.current.getBoundingClientRect()
      const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100))

      setPositions((prev) => ({ ...prev, [dragging.current.playerId]: { x, y } }))

      if (dragging.current.fromSubs) {
        setGhost((g) => g ? { ...g, x, y } : g)
      } else {
        const subsRect = subsRef.current?.getBoundingClientRect()
        setHoverSubs(
          subsRect
            ? e.clientX >= subsRect.left && e.clientX <= subsRect.right &&
              e.clientY >= subsRect.top && e.clientY <= subsRect.bottom
            : false,
        )
      }
    }

    function onUp(e) {
      if (!dragging.current) return
      const { playerId, fromSubs } = dragging.current

      if (fromSubs) {
        const pitchRect = pitchRef.current?.getBoundingClientRect()
        const onPitch =
          pitchRect &&
          e.clientX >= pitchRect.left && e.clientX <= pitchRect.right &&
          e.clientY >= pitchRect.top && e.clientY <= pitchRect.bottom
        if (onPitch) {
          onUpdateStarter(sideOf[playerId], playerId, true)
        } else {
          setPositions((prev) => {
            const next = { ...prev }
            delete next[playerId]
            return next
          })
        }
        setGhost(null)
      } else {
        const subsRect = subsRef.current?.getBoundingClientRect()
        const onSubs =
          subsRect &&
          e.clientX >= subsRect.left && e.clientX <= subsRect.right &&
          e.clientY >= subsRect.top && e.clientY <= subsRect.bottom
        if (onSubs) {
          onUpdateStarter(sideOf[playerId], playerId, false)
        }
        setHoverSubs(false)
      }

      dragging.current = null
      setDraggedId(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [sideOf, onUpdateStarter, setPositions])

  function startStarterDrag(playerId) {
    dragging.current = { playerId, fromSubs: false }
    setDraggedId(playerId)
  }

  function startSubDrag(player, e) {
    e.preventDefault()
    const rect = pitchRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100))
    dragging.current = { playerId: player.id, fromSubs: true }
    setDraggedId(player.id)
    setGhost({ player, x, y })
    setPositions((prev) => ({ ...prev, [player.id]: { x, y } }))
  }

  return { draggedId, ghost, hoverSubs, startStarterDrag, startSubDrag, pitchRef, subsRef }
}
