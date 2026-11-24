// Builds the numbers for the shareable portfolio card: returns only, grouped
// by asset class. No asset names, amounts or quantities ever leave this file.

const CLASS_ORDER = ['us', 'id', 'crypto']
const CLASS_LABELS = { us: 'US Stocks', id: 'Indonesian Stocks', crypto: 'Crypto' }

// US Stocks is limited to these holdings; unmatched holdings are left
// out (and out of the total too).
const US_HOLDINGS = ['CSPX']

export function assetClassOf(holding) {
  if (holding.asset_type === 'crypto') return 'crypto'
  const name = String(holding.asset_name || '').trim().toUpperCase()
  if (US_HOLDINGS.includes(name)) return 'us'
  // Any Indonesian stock you hold (BBCA, BBRI, TLKM, and future ones).
  const currency = String(holding.currency || '').toUpperCase()
  const symbol = String(holding.price_symbol || '').toUpperCase()
  if (holding.asset_type === 'stock' && (currency === 'IDR' || symbol.endsWith('.JK'))) return 'id'
  return null
}

const pct = (gain, cost) => (cost > 0 ? Math.round((gain / cost) * 1000) / 10 : null)

// Returns { total: number|null, classes: [{ key, label, percent }] }.
// Uses price changes only (fees excluded), like the Portfolio summary.
export function buildShareData(portfolio) {
  const groups = {}
  let totalGain = 0
  let totalCost = 0
  for (const h of portfolio?.holdings || []) {
    if (!(Number(h.quantity) > 0) || h.currentValue === null || h.currentValue === undefined) continue
    const gain = Number(h.unrealizedGainExcludingFees)
    const cost = Number(h.currentValue) - gain
    if (!Number.isFinite(gain) || !(cost > 0)) continue
    const key = assetClassOf(h)
    if (!key) continue
    groups[key] = groups[key] || { gain: 0, cost: 0 }
    groups[key].gain += gain
    groups[key].cost += cost
    totalGain += gain
    totalCost += cost
  }
  const classes = CLASS_ORDER.filter((k) => groups[k]).map((key) => ({ key, label: CLASS_LABELS[key], percent: pct(groups[key].gain, groups[key].cost) }))
  return { total: pct(totalGain, totalCost), classes }
}

const fmt = (p) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`
const RED = '#ef4444'
const GREEN = '#10b981'
// Flag emoji render as plain letters on Windows, so use symbols that render everywhere.
const CLASS_EMOJI = { us: '🗽', id: '🏝️', crypto: '🪙' }

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function spaced(ctx, value) {
  try { ctx.letterSpacing = value } catch { /* older browsers: no letter spacing */ }
}

// Draws the card onto a canvas (1080×1350, 4:5) and returns it.
export function drawShareCard(canvas, data, dateLabel) {
  const W = 1080
  const H = 1350
  const M = 80
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const font = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  const emojiFont = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  const totalUp = (data.total ?? 0) >= 0
  const accent = totalUp ? GREEN : RED
  const tint = totalUp ? '16,185,129' : '239,68,68'

  // Background: deep navy with a soft glow behind the headline number.
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0f172a')
  bg.addColorStop(1, '#070b14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 360, 20, W / 2, 360, 620)
  glow.addColorStop(0, `rgba(${tint},0.20)`)
  glow.addColorStop(1, `rgba(${tint},0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 960)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // Header: title on the left, date pill on the right.
  ctx.fillStyle = '#94a3b8'
  ctx.font = `600 28px ${font}`
  spaced(ctx, '5px')
  ctx.fillText('PORTFOLIO PERFORMANCE', M, 128)
  spaced(ctx, '0px')
  ctx.font = `500 26px ${font}`
  const dateW = ctx.measureText(dateLabel).width
  const pillW = dateW + 48
  roundRectPath(ctx, W - M - pillW, 92, pillW, 52, 26)
  ctx.fillStyle = 'rgba(148,163,184,0.12)'
  ctx.fill()
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(dateLabel, W - M - pillW + 24, 127)

  // Hero: the total.
  ctx.fillStyle = '#94a3b8'
  ctx.font = `600 30px ${font}`
  spaced(ctx, '4px')
  ctx.fillText('UNREALIZED P&L', M, 290)
  spaced(ctx, '0px')
  ctx.fillStyle = accent
  ctx.font = `800 210px ${font}`
  spaced(ctx, '-6px')
  ctx.fillText(data.total === null ? '—' : fmt(data.total), M - 6, 480)
  spaced(ctx, '0px')

  // Breakdown panel.
  const panelY = 580
  const rowH = 170
  const panelH = Math.max(1, data.classes.length) * rowH + 20
  roundRectPath(ctx, M, panelY, W - M * 2, panelH, 36)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Bars share one scale so their lengths can be compared.
  const maxAbs = Math.max(10, ...data.classes.map((c) => Math.abs(c.percent ?? 0)))
  const inner = M + 44
  const innerW = W - M * 2 - 88
  data.classes.forEach((c, i) => {
    const y = panelY + 10 + i * rowH
    const up = (c.percent ?? 0) >= 0
    const color = c.percent === null ? '#64748b' : up ? GREEN : RED
    const tone = c.percent === null ? '100,116,139' : up ? '16,185,129' : '239,68,68'

    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(inner, y)
      ctx.lineTo(inner + innerW, y)
      ctx.stroke()
    }

    // Icon badge.
    ctx.beginPath()
    ctx.arc(inner + 34, y + 62, 34, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${tone},0.14)`
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `34px ${emojiFont}`
    ctx.textAlign = 'center'
    ctx.fillText(CLASS_EMOJI[c.key] || '', inner + 34, y + 75)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#e2e8f0'
    ctx.font = `500 42px ${font}`
    ctx.fillText(c.label, inner + 90, y + 76)

    ctx.fillStyle = color
    ctx.font = `700 54px ${font}`
    ctx.textAlign = 'right'
    ctx.fillText(c.percent === null ? '—' : fmt(c.percent), inner + innerW, y + 78)
    ctx.textAlign = 'left'

    roundRectPath(ctx, inner, y + 112, innerW, 12, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fill()
    if (c.percent !== null) {
      roundRectPath(ctx, inner, y + 112, Math.max(12, (Math.abs(c.percent) / maxAbs) * innerW * 0.94), 12, 6)
      ctx.fillStyle = color
      ctx.fill()
    }
  })

  // Footer: how the numbers are measured.
  ctx.fillStyle = '#64748b'
  ctx.font = `400 26px ${font}`
  ctx.textAlign = 'left'
  ctx.fillText('Price changes only · fees not included', M, H - 70)
  return canvas
}
