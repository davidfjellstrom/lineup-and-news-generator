import PptxGenJS from 'pptxgenjs'

const SW = 13.33
const SH = 7.5
const HEADER_H = 0.65
const PITCH_H = 5.0
const PX = 0
const PY = HEADER_H
const PW = SW
const SUBS_Y = PY + PITCH_H
const SUBS_H = SH - SUBS_Y

const PHOTO_D = 0.46
const BADGE_D = 0.16
const CARD_W = 0.82

async function tryFetchBase64(url) {
  try {
    const resp = await fetch(url)
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

function px(pct) { return PX + (pct / 100) * PW }
function py(pct) { return PY + (pct / 100) * PITCH_H }

export async function exportPptx({ match, positions, matchMode }) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'

  const slide = pptx.addSlide()
  slide.background = { color: '111827' }

  const { homeTeam, awayTeam, referee } = match
  const homeStarters = homeTeam.players.filter((p) => p.isStarter)
  const awayStarters = awayTeam.players.filter((p) => p.isStarter)
  const homeSubs = homeTeam.players.filter((p) => !p.isStarter)
  const awaySubs = awayTeam.players.filter((p) => !p.isStarter)
  const allStarters = [...homeStarters, ...awayStarters]

  // Pre-fetch photos in parallel (fails gracefully if CORS-blocked)
  const photoCache = {}
  await Promise.all(
    allStarters.filter((p) => p.photo).map(async (p) => {
      const b64 = await tryFetchBase64(p.photo)
      if (b64) photoCache[p.id] = b64
    })
  )

  // ─── Header ───
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SW, h: HEADER_H,
    fill: { color: '1F2937' },
    line: { type: 'none' },
  })

  slide.addText(
    [
      { text: `${homeTeam.flag} ${homeTeam.name}`, options: { fontSize: 13, bold: true, color: 'FFFFFF' } },
      { text: `  ${homeTeam.formation}`, options: { fontSize: 10, bold: true, color: '4ADE80' } },
    ],
    { x: 0.2, y: 0.05, w: 4.5, h: 0.3 }
  )
  slide.addText(`Coach: ${homeTeam.coach || '—'}`, {
    x: 0.2, y: 0.37, w: 4.5, h: 0.22, fontSize: 8, color: '9CA3AF',
  })

  slide.addText(
    [
      { text: `${awayTeam.formation}  `, options: { fontSize: 10, bold: true, color: '4ADE80' } },
      { text: `${awayTeam.name} ${awayTeam.flag}`, options: { fontSize: 13, bold: true, color: 'FFFFFF' } },
    ],
    { x: SW - 4.7, y: 0.05, w: 4.5, h: 0.3, align: 'right' }
  )
  slide.addText(`Coach: ${awayTeam.coach || '—'}`, {
    x: SW - 4.7, y: 0.37, w: 4.5, h: 0.22, fontSize: 8, color: '9CA3AF', align: 'right',
  })

  slide.addText('REFEREE', {
    x: SW / 2 - 1.5, y: 0.04, w: 3, h: 0.16,
    fontSize: 6.5, bold: true, color: '6B7280', align: 'center', charSpacing: 1,
  })
  slide.addText(referee || '—', {
    x: SW / 2 - 1.5, y: 0.19, w: 3, h: 0.2, fontSize: 9, color: 'D1D5DB', align: 'center',
  })

  const isMM = matchMode === 'match'
  slide.addShape(pptx.ShapeType.rect, {
    x: SW / 2 - 0.65, y: 0.42, w: 1.3, h: 0.18,
    fill: { color: isMM ? '14532D' : '78350F' },
    line: { color: isMM ? '16A34A' : 'D97706', width: 0.5 },
  })
  slide.addText(isMM ? '● Bekräftad' : '◌ Estimerad', {
    x: SW / 2 - 0.65, y: 0.42, w: 1.3, h: 0.18,
    fontSize: 6.5, bold: true, color: isMM ? '86EFAC' : 'FDE68A',
    align: 'center', valign: 'middle',
  })

  // ─── Pitch ───
  const STRIPE_COUNT = 8
  const STRIPE_W = PW / STRIPE_COUNT
  for (let i = 0; i < STRIPE_COUNT; i++) {
    slide.addShape(pptx.ShapeType.rect, {
      x: PX + i * STRIPE_W, y: PY, w: STRIPE_W, h: PITCH_H,
      fill: { color: i % 2 === 0 ? '1A6B3C' : '1D7542' },
      line: { type: 'none' },
    })
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: PX, y: PY, w: PW, h: PITCH_H,
    fill: { type: 'none' },
    line: { color: 'FFFFFF', width: 0.75, transparency: 50 },
  })

  // Center line
  slide.addShape(pptx.ShapeType.rect, {
    x: PX + PW / 2 - 0.01, y: PY, w: 0.02, h: PITCH_H,
    fill: { color: 'FFFFFF', transparency: 50 },
    line: { type: 'none' },
  })

  // Center circle
  const CC_D = 1.1
  slide.addShape(pptx.ShapeType.ellipse, {
    x: PX + PW / 2 - CC_D / 2, y: PY + PITCH_H / 2 - CC_D / 2, w: CC_D, h: CC_D,
    fill: { type: 'none' },
    line: { color: 'FFFFFF', width: 0.75, transparency: 50 },
  })
  slide.addShape(pptx.ShapeType.ellipse, {
    x: PX + PW / 2 - 0.05, y: PY + PITCH_H / 2 - 0.05, w: 0.1, h: 0.1,
    fill: { color: 'FFFFFF', transparency: 50 },
    line: { type: 'none' },
  })

  // Penalty boxes
  const PB_W = PW * 0.12
  const PB_H = PITCH_H * 0.50
  const PB_Y = PY + PITCH_H * 0.25
  const SB_W = PW * 0.05
  const SB_H = PITCH_H * 0.26
  const SB_Y = PY + PITCH_H * 0.37

  for (const [bx, sbx] of [[PX, PX], [PX + PW - PB_W, PX + PW - SB_W]]) {
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

  // ─── Starters ───
  for (const player of allStarters) {
    const pos = positions[player.id]
    if (!pos) continue

    const cx = px(pos.x)
    const cy = py(pos.y)

    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx - PHOTO_D / 2, y: cy - PHOTO_D / 2, w: PHOTO_D, h: PHOTO_D,
      fill: { color: '6B7280' },
      line: { color: 'FFFFFF', width: 1 },
    })

    if (photoCache[player.id]) {
      slide.addImage({
        data: photoCache[player.id],
        x: cx - PHOTO_D / 2, y: cy - PHOTO_D / 2, w: PHOTO_D, h: PHOTO_D,
        rounding: true,
      })
    }

    // Jersey number badge (top-left of photo)
    const bx = cx - PHOTO_D / 2 - 0.02
    const by = cy - PHOTO_D / 2 - 0.02
    slide.addShape(pptx.ShapeType.ellipse, {
      x: bx, y: by, w: BADGE_D, h: BADGE_D,
      fill: { color: 'FFFFFF' },
      line: { type: 'none' },
    })
    slide.addText(String(player.number ?? ''), {
      x: bx, y: by, w: BADGE_D, h: BADGE_D,
      fontSize: 6, bold: true, color: '000000', align: 'center', valign: 'middle',
    })

    let textY = cy + PHOTO_D / 2 + 0.03
    if (player.firstName) {
      slide.addText(player.firstName.toUpperCase(), {
        x: cx - CARD_W / 2, y: textY, w: CARD_W, h: 0.15,
        fontSize: 6, color: 'A0AEC0', align: 'center',
      })
      textY += 0.14
    }
    slide.addText((player.lastName || '—').toUpperCase(), {
      x: cx - CARD_W / 2, y: textY, w: CARD_W, h: 0.18,
      fontSize: 8, bold: true, color: 'FFFFFF', align: 'center',
    })
    textY += 0.17
    if (player.notes) {
      slide.addText(player.notes, {
        x: cx - CARD_W / 2, y: textY, w: CARD_W, h: 0.22,
        fontSize: 6, italic: true, color: 'FFFDE7', align: 'center', wrap: true,
      })
    }
  }

  // ─── Substitutes ───
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: SUBS_Y, w: SW, h: SUBS_H,
    fill: { color: '000000', transparency: 50 },
    line: { type: 'none' },
  })
  slide.addShape(pptx.ShapeType.rect, {
    x: SW / 2 - 0.01, y: SUBS_Y, w: 0.02, h: SUBS_H,
    fill: { color: 'FFFFFF', transparency: 80 },
    line: { type: 'none' },
  })

  const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']
  const SUB_D = 0.33
  const SUB_BADGE_D = 0.12
  const SUB_CARD_W = 0.6

  function renderSubs(subs, startX) {
    const ROW_H = SUBS_H / POS_ORDER.length
    const LABEL_W = 0.28
    POS_ORDER.forEach((position, ri) => {
      const group = subs.filter((p) => p.position === position)
      if (!group.length) return
      const rowY = SUBS_Y + ri * ROW_H
      const rowCY = rowY + ROW_H / 2

      slide.addText(position, {
        x: startX, y: rowY, w: LABEL_W, h: ROW_H,
        fontSize: 7, bold: true, color: '9CA3AF', align: 'center', valign: 'middle',
      })

      group.forEach((player, i) => {
        const spx = startX + LABEL_W + i * (SUB_CARD_W + 0.04) + 0.04

        slide.addShape(pptx.ShapeType.ellipse, {
          x: spx, y: rowCY - SUB_D / 2, w: SUB_D, h: SUB_D,
          fill: { color: '6B7280' },
          line: { color: 'FFFFFF', width: 0.5 },
        })
        slide.addShape(pptx.ShapeType.ellipse, {
          x: spx, y: rowCY - SUB_D / 2, w: SUB_BADGE_D, h: SUB_BADGE_D,
          fill: { color: 'FFFFFF' },
          line: { type: 'none' },
        })
        slide.addText(String(player.number ?? ''), {
          x: spx, y: rowCY - SUB_D / 2, w: SUB_BADGE_D, h: SUB_BADGE_D,
          fontSize: 4.5, bold: true, color: '000000', align: 'center', valign: 'middle',
        })
        slide.addText((player.lastName || '—').toUpperCase(), {
          x: spx - 0.06, y: rowCY + SUB_D / 2 + 0.01, w: SUB_CARD_W + 0.12, h: 0.14,
          fontSize: 5.5, bold: true, color: 'FFFFFF', align: 'center',
        })
        if (player.notes) {
          slide.addText(player.notes, {
            x: spx - 0.06, y: rowCY + SUB_D / 2 + 0.14, w: SUB_CARD_W + 0.12, h: 0.16,
            fontSize: 4.5, italic: true, color: 'FFFDE7', align: 'center', wrap: true,
          })
        }
      })
    })
  }

  renderSubs(homeSubs, 0.1)
  renderSubs(awaySubs, SW / 2 + 0.1)

  const home = homeTeam.name?.toLowerCase() || 'home'
  const away = awayTeam.name?.toLowerCase() || 'away'
  await pptx.writeFile({ fileName: `${home}-vs-${away}-lineup.pptx` })
}
