import PptxGenJS from 'pptxgenjs'

// ─── Layout constants ────────────────────────────────────────────────────────
const SW = 13.33          // slide width  (inches, LAYOUT_WIDE)
const SH = 7.5            // slide height
const HEADER_H = 0.72
const PITCH_H  = 3.8      // shorter pitch → more room for subs
const SUBS_Y   = HEADER_H + PITCH_H
const SUBS_H   = SH - SUBS_Y   // ≈ 2.98"

// Starter player card
const PHOTO_D = 0.62
const BADGE_D = 0.22
const CARD_W  = 1.10

// Substitute card
const SUB_D        = 0.44
const SUB_BADGE_D  = 0.16
const SUB_CARD_W   = 0.78
const SUB_LABEL_W  = 0.40
const SUB_ROW_H    = SUBS_H / 4   // ≈ 0.745" — just fits circle + name + notes

// ─── Helpers ─────────────────────────────────────────────────────────────────
function trunc(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function pitchX(pct) { return (pct / 100) * SW }
function pitchY(pct) { return HEADER_H + (pct / 100) * PITCH_H }

async function tryFetchBase64(url) {
  try {
    // Route through server-side proxy to bypass CORS on external CDNs
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`
    const resp = await fetch(proxyUrl)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function exportPptx({ match, positions, matchMode }) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'

  const slide = pptx.addSlide()
  slide.background = { color: '111827' }

  const { homeTeam, awayTeam, referee } = match
  const homeStarters  = homeTeam.players.filter((p) => p.isStarter)
  const awayStarters  = awayTeam.players.filter((p) => p.isStarter)
  const homeSubs      = homeTeam.players.filter((p) => !p.isStarter)
  const awaySubs      = awayTeam.players.filter((p) => !p.isStarter)

  // Pre-fetch all starter photos via proxy (concurrent)
  const photoCache = {}
  await Promise.all(
    [...homeStarters, ...awayStarters].filter((p) => p.photo).map(async (p) => {
      const b64 = await tryFetchBase64(p.photo)
      if (b64) photoCache[p.id] = b64
    })
  )

  // ═══ HEADER ══════════════════════════════════════════════════════════════════
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SW, h: HEADER_H,
    fill: { color: '1F2937' },
    line: { type: 'none' },
  })

  // Home team
  slide.addText(
    [
      { text: `${homeTeam.flag} ${homeTeam.name}`, options: { fontSize: 15, bold: true, color: 'FFFFFF' } },
      { text: `  ${homeTeam.formation}`, options: { fontSize: 12, bold: true, color: '4ADE80' } },
    ],
    { x: 0.2, y: 0.06, w: 5, h: 0.32 }
  )
  slide.addText(`Coach: ${homeTeam.coach || '—'}`, {
    x: 0.2, y: 0.40, w: 5, h: 0.24, fontSize: 9.5, color: '9CA3AF',
  })

  // Away team (right-aligned)
  slide.addText(
    [
      { text: `${awayTeam.formation}  `, options: { fontSize: 12, bold: true, color: '4ADE80' } },
      { text: `${awayTeam.name} ${awayTeam.flag}`, options: { fontSize: 15, bold: true, color: 'FFFFFF' } },
    ],
    { x: SW - 5.2, y: 0.06, w: 5, h: 0.32, align: 'right' }
  )
  slide.addText(`Coach: ${awayTeam.coach || '—'}`, {
    x: SW - 5.2, y: 0.40, w: 5, h: 0.24, fontSize: 9.5, color: '9CA3AF', align: 'right',
  })

  // Referee + mode badge (centre)
  slide.addText('REFEREE', {
    x: SW / 2 - 1.5, y: 0.04, w: 3, h: 0.18,
    fontSize: 7.5, bold: true, color: '6B7280', align: 'center', charSpacing: 1,
  })
  slide.addText(referee || '—', {
    x: SW / 2 - 1.5, y: 0.21, w: 3, h: 0.22, fontSize: 11, color: 'D1D5DB', align: 'center',
  })
  const isMM = matchMode === 'match'
  slide.addShape(pptx.ShapeType.rect, {
    x: SW / 2 - 0.7, y: 0.46, w: 1.4, h: 0.20,
    fill: { color: isMM ? '14532D' : '78350F' },
    line: { color: isMM ? '16A34A' : 'D97706', width: 0.5 },
  })
  slide.addText(isMM ? '● Bekräftad' : '◌ Estimerad', {
    x: SW / 2 - 0.7, y: 0.46, w: 1.4, h: 0.20,
    fontSize: 7.5, bold: true, color: isMM ? '86EFAC' : 'FDE68A',
    align: 'center', valign: 'middle',
  })

  // ═══ PITCH ════════════════════════════════════════════════════════════════════
  const STRIPE_COUNT = 8
  const STRIPE_W = SW / STRIPE_COUNT
  for (let i = 0; i < STRIPE_COUNT; i++) {
    slide.addShape(pptx.ShapeType.rect, {
      x: i * STRIPE_W, y: HEADER_H, w: STRIPE_W, h: PITCH_H,
      fill: { color: i % 2 === 0 ? '1A6B3C' : '1D7542' },
      line: { type: 'none' },
    })
  }

  // Pitch border
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: HEADER_H, w: SW, h: PITCH_H,
    fill: { type: 'none' },
    line: { color: 'FFFFFF', width: 0.75, transparency: 50 },
  })

  // Centre line
  slide.addShape(pptx.ShapeType.rect, {
    x: SW / 2 - 0.01, y: HEADER_H, w: 0.02, h: PITCH_H,
    fill: { color: 'FFFFFF', transparency: 50 },
    line: { type: 'none' },
  })

  // Centre circle + dot
  const CC_D = 1.0
  slide.addShape(pptx.ShapeType.ellipse, {
    x: SW / 2 - CC_D / 2, y: HEADER_H + PITCH_H / 2 - CC_D / 2, w: CC_D, h: CC_D,
    fill: { type: 'none' },
    line: { color: 'FFFFFF', width: 0.75, transparency: 50 },
  })
  slide.addShape(pptx.ShapeType.ellipse, {
    x: SW / 2 - 0.05, y: HEADER_H + PITCH_H / 2 - 0.05, w: 0.10, h: 0.10,
    fill: { color: 'FFFFFF', transparency: 50 },
    line: { type: 'none' },
  })

  // Penalty boxes (home = left, away = right)
  const PB_W = SW * 0.12
  const PB_H = PITCH_H * 0.50
  const PB_Y = HEADER_H + PITCH_H * 0.25
  const SB_W = SW * 0.05
  const SB_H = PITCH_H * 0.26
  const SB_Y = HEADER_H + PITCH_H * 0.37

  for (const [bx, sbx] of [[0, 0], [SW - PB_W, SW - SB_W]]) {
    slide.addShape(pptx.ShapeType.rect, {
      x: bx, y: PB_Y, w: PB_W, h: PB_H,
      fill: { type: 'none' },
      line: { color: 'FFFFFF', width: 0.75, transparency: 50 },
    })
    slide.addShape(pptx.ShapeType.rect, {
      x: sbx, y: SB_Y, w: SB_W, h: SB_H,
      fill: { type: 'none' },
      line: { color: 'FFFFFF', width: 0.5, transparency: 60 },
    })
  }

  // ═══ STARTERS ════════════════════════════════════════════════════════════════
  const allStarters = [...homeStarters, ...awayStarters]
  for (const player of allStarters) {
    const pos = positions[player.id]
    if (!pos) continue

    // Clamp so card never bleeds off the slide edge
    const rawCx = pitchX(pos.x)
    const cx = Math.max(CARD_W / 2 + 0.05, Math.min(SW - CARD_W / 2 - 0.05, rawCx))
    const cy = pitchY(pos.y)

    // Photo background
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx - PHOTO_D / 2, y: cy - PHOTO_D / 2, w: PHOTO_D, h: PHOTO_D,
      fill: { color: '6B7280' },
      line: { color: 'FFFFFF', width: 1.2 },
    })
    if (photoCache[player.id]) {
      slide.addImage({
        data: photoCache[player.id],
        x: cx - PHOTO_D / 2, y: cy - PHOTO_D / 2, w: PHOTO_D, h: PHOTO_D,
        rounding: true,
      })
    }

    // Jersey badge (top-left of circle)
    const bx = cx - PHOTO_D / 2 - 0.02
    const by = cy - PHOTO_D / 2 - 0.02
    slide.addShape(pptx.ShapeType.ellipse, {
      x: bx, y: by, w: BADGE_D, h: BADGE_D,
      fill: { color: 'FFFFFF' }, line: { type: 'none' },
    })
    slide.addText(String(player.number ?? ''), {
      x: bx, y: by, w: BADGE_D, h: BADGE_D,
      fontSize: 7.5, bold: true, color: '000000', align: 'center', valign: 'middle',
    })

    // Name rows
    let textY = cy + PHOTO_D / 2 + 0.04
    if (player.firstName) {
      slide.addText(trunc(player.firstName.toUpperCase(), 14), {
        x: cx - CARD_W / 2, y: textY, w: CARD_W, h: 0.16,
        fontSize: 7.5, color: 'A0AEC0', align: 'center',
      })
      textY += 0.15
    }
    slide.addText(trunc((player.lastName || '—').toUpperCase(), 14), {
      x: cx - CARD_W / 2, y: textY, w: CARD_W, h: 0.20,
      fontSize: 10, bold: true, color: 'FFFFFF', align: 'center',
    })
    textY += 0.19
    if (player.notes) {
      slide.addText(player.notes, {
        x: cx - CARD_W / 2, y: textY, w: CARD_W, h: 0.22,
        fontSize: 7, italic: true, color: 'FFFDE7', align: 'center', wrap: true,
      })
    }
  }

  // ═══ SUBSTITUTES ═════════════════════════════════════════════════════════════
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: SUBS_Y, w: SW, h: SUBS_H,
    fill: { color: '000000', transparency: 50 },
    line: { type: 'none' },
  })
  // Divider
  slide.addShape(pptx.ShapeType.rect, {
    x: SW / 2 - 0.01, y: SUBS_Y, w: 0.02, h: SUBS_H,
    fill: { color: 'FFFFFF', transparency: 80 },
    line: { type: 'none' },
  })

  const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']

  function renderSubs(subs, startX) {
    const CARD_STEP = SUB_CARD_W + 0.06

    POS_ORDER.forEach((position, ri) => {
      const group = subs.filter((p) => p.position === position)
      if (!group.length) return

      const rowY  = SUBS_Y + ri * SUB_ROW_H
      const rowCY = rowY + SUB_ROW_H / 2

      // Position label (full word, proper width)
      slide.addText(position, {
        x: startX, y: rowY, w: SUB_LABEL_W, h: SUB_ROW_H,
        fontSize: 9, bold: true, color: '9CA3AF', align: 'center', valign: 'middle',
      })

      group.forEach((player, i) => {
        const spx = startX + SUB_LABEL_W + i * CARD_STEP + 0.04

        // Photo circle
        slide.addShape(pptx.ShapeType.ellipse, {
          x: spx, y: rowCY - SUB_D / 2, w: SUB_D, h: SUB_D,
          fill: { color: '6B7280' },
          line: { color: 'FFFFFF', width: 0.75 },
        })

        // Badge
        slide.addShape(pptx.ShapeType.ellipse, {
          x: spx, y: rowCY - SUB_D / 2, w: SUB_BADGE_D, h: SUB_BADGE_D,
          fill: { color: 'FFFFFF' }, line: { type: 'none' },
        })
        slide.addText(String(player.number ?? ''), {
          x: spx, y: rowCY - SUB_D / 2, w: SUB_BADGE_D, h: SUB_BADGE_D,
          fontSize: 6, bold: true, color: '000000', align: 'center', valign: 'middle',
        })

        // Last name
        slide.addText(trunc((player.lastName || '—').toUpperCase(), 12), {
          x: spx - 0.06, y: rowCY + SUB_D / 2 + 0.02, w: SUB_CARD_W + 0.12, h: 0.16,
          fontSize: 7, bold: true, color: 'FFFFFF', align: 'center',
        })

        // Notes
        if (player.notes) {
          slide.addText(player.notes, {
            x: spx - 0.06, y: rowCY + SUB_D / 2 + 0.17, w: SUB_CARD_W + 0.12, h: 0.18,
            fontSize: 5.5, italic: true, color: 'FFFDE7', align: 'center', wrap: true,
          })
        }
      })
    })
  }

  renderSubs(homeSubs, 0.10)
  renderSubs(awaySubs, SW / 2 + 0.10)

  // ─── Write file ───────────────────────────────────────────────────────────────
  const home = homeTeam.name?.toLowerCase() || 'home'
  const away = awayTeam.name?.toLowerCase() || 'away'
  await pptx.writeFile({ fileName: `${home}-vs-${away}-lineup.pptx` })
}
