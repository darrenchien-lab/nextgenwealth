'use strict'
const fs = require('fs')
const PDFDocument = require('pdfkit')
const { query } = require('../db/pool')
const { badRequest } = require('../shared/utils')
const reportsService = require('./reports')
const accountsService = require('./accounts')
const investmentsService = require('./investments')
const transactionsService = require('./transactions')
const savingsGoalsService = require('./savingsGoals')
const currencyService = require('./currency')
const aggregates = require('../shared/financialAggregates')

// --- Look ---------------------------------------------------------------

const COLOR = {
  brand: '#059669',
  brandDark: '#065f46',
  ink: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  panel: '#f9fafb',
  up: '#059669',
  down: '#dc2626',
  bar: '#10b981'
}
const PAGE = { size: 'A4', margin: 48 }

// The built-in PDF fonts only cover Western European letters, so notes like
// "Bonus 中秋節" would print as garbage. The first font found that covers
// Chinese/Japanese too is used; failing that, the built-ins, with anything
// they can't show replaced.
const FONT_CANDIDATES = [
  {
    regular: [process.env.REPORT_FONT_REGULAR, process.env.REPORT_FONT_REGULAR_NAME],
    bold: [process.env.REPORT_FONT_BOLD, process.env.REPORT_FONT_BOLD_NAME]
  },
  {
    regular: ['C:/Windows/Fonts/msjh.ttc', 'MicrosoftJhengHeiRegular'],
    bold: ['C:/Windows/Fonts/msjhbd.ttc', 'MicrosoftJhengHeiBold']
  },
  {
    regular: ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'NotoSansCJKtc-Regular'],
    bold: ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 'NotoSansCJKtc-Bold']
  },
  {
    regular: ['/System/Library/Fonts/PingFang.ttc', 'PingFangTC-Regular'],
    bold: ['/System/Library/Fonts/PingFang.ttc', 'PingFangTC-Semibold']
  }
]

const setUpFonts = (doc) => {
  for (const candidate of FONT_CANDIDATES) {
    const [regularPath, regularName] = candidate.regular
    const [boldPath, boldName] = candidate.bold
    if (!regularPath || !boldPath || !fs.existsSync(regularPath) || !fs.existsSync(boldPath)) continue
    try {
      doc.registerFont('Body', regularPath, regularName)
      doc.registerFont('Bold', boldPath, boldName)
      doc.font('Body').text('', 0, 0)
      return { unicode: true }
    } catch {
      // Try the next one.
    }
  }
  doc.registerFont('Body', 'Helvetica')
  doc.registerFont('Bold', 'Helvetica-Bold')
  return { unicode: false }
}

// --- Formatting ---------------------------------------------------------

const money = (amount, currency) => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '-'
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'IDR' ? 0 : 2
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}
const signedMoney = (amount, currency) => `${amount >= 0 ? '+' : '-'}${money(Math.abs(amount), currency)}`
const pct = (value, { signed = false } = {}) => (value === null || value === undefined ? '-' : `${signed && value > 0 ? '+' : ''}${value}%`)
const quantity = (q) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 }).format(Number(q))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (value) => {
  const d = new Date(value)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const TYPE_LABELS = { bank: 'Bank', e_wallet: 'E-wallet', cash: 'Cash', credit_card: 'Credit card' }

// --- Drawing helpers ----------------------------------------------------

const createPainter = (doc, { unicode }) => {
  const clean = (text) => {
    const value = String(text ?? '')
    return unicode ? value : value.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2212]/g, '?')
  }
  const left = PAGE.margin
  const width = doc.page.width - PAGE.margin * 2
  const bottom = () => doc.page.height - PAGE.margin - 24

  const ensureSpace = (height) => {
    if (doc.y + height > bottom()) {
      doc.addPage()
      doc.y = PAGE.margin
    }
  }

  const text = (value, x, y, { font = 'Body', size = 10, color = COLOR.ink, width: w, align = 'left', lineBreak = false } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(clean(value), x, y, { width: w, align, lineBreak, ellipsis: !lineBreak && w ? true : undefined })
  }

  const sectionTitle = (title, subtitle) => {
    ensureSpace(60)
    doc.y += 14
    const y = doc.y
    doc.rect(left, y + 2, 3, 14).fill(COLOR.brand)
    text(title, left + 10, y, { font: 'Bold', size: 13 })
    if (subtitle) text(subtitle, left + 10, y + 18, { size: 9, color: COLOR.muted, width: width - 10 })
    doc.y = y + (subtitle ? 36 : 24)
  }

  // A simple table: a header row, then rows that break onto new pages with
  // the header repeated. Cells may carry their own colour / boldness.
  const table = (columns, rows, { totalRow } = {}) => {
    const rowHeight = 20
    const drawHeader = () => {
      const y = doc.y
      doc.rect(left, y, width, rowHeight).fill(COLOR.panel)
      let x = left
      for (const col of columns) {
        text(col.label.toUpperCase(), x + 6, y + 6.5, { font: 'Bold', size: 7.5, color: COLOR.muted, width: col.width - 12, align: col.align })
        x += col.width
      }
      doc.y = y + rowHeight
    }
    const drawRow = (cells, { bold = false, top = false } = {}) => {
      if (doc.y + rowHeight > bottom()) {
        doc.addPage()
        doc.y = PAGE.margin
        drawHeader()
      }
      const y = doc.y
      if (top) doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor(COLOR.ink).stroke()
      let x = left
      columns.forEach((col, i) => {
        const cell = cells[i]
        const styled = cell !== null && typeof cell === 'object'
        const value = styled ? cell.value : cell
        const color = styled && cell.color ? cell.color : COLOR.ink
        text(value, x + 6, y + 6, { font: bold || (styled && cell.bold) ? 'Bold' : 'Body', size: 9, color, width: col.width - 12, align: col.align })
        x += col.width
      })
      doc.y = y + rowHeight
      if (!top) doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor(COLOR.line).stroke()
    }
    ensureSpace(rowHeight * Math.min(rows.length + 1, 4))
    drawHeader()
    rows.forEach((row) => drawRow(row))
    if (totalRow) drawRow(totalRow, { bold: true, top: true })
  }

  const empty = (message) => {
    ensureSpace(30)
    text(message, left, doc.y + 4, { size: 9, color: COLOR.muted, width })
    doc.y += 24
  }

  return { left, width, text, sectionTitle, table, empty, ensureSpace, clean }
}

// --- Data ---------------------------------------------------------------

const gatherReport = async (userId, { periodOffset }) => {
  const offset = Number(periodOffset) === 1 ? 1 : 0
  const [summary, breakdown, accounts, portfolio, xirr, goals, user] = await Promise.all([
    reportsService.getDashboardSummary(userId, { periodOffset: offset }),
    aggregates.getExpenseBreakdown(userId, { periodOffset: offset }),
    accountsService.listAccounts(userId),
    investmentsService.getPortfolio(userId),
    investmentsService.getPortfolioXirr(userId).catch(() => ({ available: false })),
    savingsGoalsService.listGoals(userId).catch(() => []),
    query('SELECT email FROM users WHERE id = $1', [userId]).then((r) => r.rows[0])
  ])
  const transactions = await transactionsService.listTransactions(userId, { period: breakdown.period || 'current' })
  const currency = summary.displayCurrency

  const accountRows = []
  for (const account of accounts) {
    const balance = Number(account.balance)
    const converted = account.currency === currency
      ? { amount: balance, available: true }
      : await currencyService.convertAmount(balance, account.currency, currency)
    accountRows.push({ ...account, balance, converted: converted.available ? converted.amount : null })
  }

  const categoryNames = new Map((await query('SELECT id, name FROM categories WHERE user_id = $1 OR user_id IS NULL', [userId])).rows.map((c) => [c.id, c.name]))
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  return { offset, summary, breakdown, accountRows, portfolio, xirr, goals, user, transactions, currency, categoryNames, accountById }
}

// --- The document -------------------------------------------------------

const generatePdfBuffer = (data) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin, bufferPages: true, info: { Title: 'NextGen Wealth — Financial Report', Author: 'NextGen Wealth' } })
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  doc.on('end', () => resolve(Buffer.concat(chunks)))
  doc.on('error', reject)

  const fonts = setUpFonts(doc)
  const p = createPainter(doc, fonts)
  const { summary, breakdown, accountRows, portfolio, xirr, goals, transactions, currency } = data
  const { left, width } = p

  // Header band
  doc.rect(0, 0, doc.page.width, 112).fill(COLOR.brandDark)
  p.text('NEXTGEN WEALTH', left, 34, { font: 'Bold', size: 9, color: '#a7f3d0' })
  p.text('Financial Report', left, 48, { font: 'Bold', size: 24, color: '#ffffff' })
  p.text(`Budget cycle ${summary.periodLabel}${data.offset === 1 ? ' (last cycle)' : ''}`, left, 80, { size: 10, color: '#d1fae5' })
  p.text(`Generated ${day(new Date())}`, left, 40, { size: 9, color: '#d1fae5', width, align: 'right' })
  if (data.user?.email) p.text(data.user.email, left, 54, { size: 9, color: '#d1fae5', width, align: 'right' })
  p.text(`Amounts in ${currency}`, left, 68, { size: 9, color: '#d1fae5', width, align: 'right' })
  doc.y = 136

  // Overview cards
  p.sectionTitle('Overview', 'Where things stand this budget cycle.')
  const changes = summary.changes || {}
  const cards = [
    { label: 'Net worth', value: money(summary.netWorth, currency), note: changes.netWorth !== null && changes.netWorth !== undefined ? `${pct(changes.netWorth, { signed: true })} this cycle` : '', tone: changes.netWorth },
    { label: 'Income', value: money(summary.income, currency), note: changes.income !== null && changes.income !== undefined ? `${pct(changes.income, { signed: true })} vs last cycle` : '' },
    { label: 'Expenses', value: money(summary.expense, currency), note: changes.expense !== null && changes.expense !== undefined ? `${pct(changes.expense, { signed: true })} vs last cycle` : '' },
    { label: 'Saved', value: signedMoney(summary.net, currency), tone: summary.net },
    { label: 'Savings rate', value: pct(summary.savingsRate), note: 'of income kept' },
    { label: 'Financial health', value: `${summary.financialHealthScore ?? '-'} / 100`, note: 'based on savings rate' }
  ]
  const cardW = (width - 2 * 12) / 3
  const cardH = 62
  const top = doc.y
  cards.forEach((card, i) => {
    const x = left + (i % 3) * (cardW + 12)
    const y = top + Math.floor(i / 3) * (cardH + 12)
    doc.roundedRect(x, y, cardW, cardH, 6).fillAndStroke(COLOR.panel, COLOR.line)
    p.text(card.label.toUpperCase(), x + 12, y + 11, { font: 'Bold', size: 7.5, color: COLOR.muted, width: cardW - 24 })
    const valueColor = card.tone === undefined || card.tone === null ? COLOR.ink : card.tone >= 0 ? COLOR.up : COLOR.down
    p.text(card.value, x + 12, y + 25, { font: 'Bold', size: 13, color: valueColor, width: cardW - 24 })
    if (card.note) p.text(card.note, x + 12, y + 44, { size: 8, color: COLOR.faint, width: cardW - 24 })
  })
  doc.y = top + 2 * cardH + 12

  // Spending by category
  p.sectionTitle('Spending by category', `${money(breakdown.total, currency)} spent this cycle.`)
  if (!breakdown.breakdown.length) {
    p.empty('No expenses recorded in this cycle.')
  } else {
    const rows = [...breakdown.breakdown].sort((a, b) => b.amount - a.amount)
    const max = rows[0].amount || 1
    const nameW = 150
    const amountW = 110
    const pctW = 46
    const barW = width - nameW - amountW - pctW - 12
    for (const row of rows) {
      p.ensureSpace(20)
      const y = doc.y
      p.text(row.categoryName, left, y + 4, { size: 9, width: nameW - 8 })
      doc.roundedRect(left + nameW, y + 5, barW, 8, 4).fill(COLOR.line)
      doc.roundedRect(left + nameW, y + 5, Math.max(4, barW * (row.amount / max)), 8, 4).fill(COLOR.bar)
      p.text(money(row.amount, currency), left + nameW + barW + 6, y + 4, { size: 9, width: amountW, align: 'right' })
      p.text(pct(row.percentage), left + nameW + barW + 6 + amountW, y + 4, { size: 9, color: COLOR.muted, width: pctW, align: 'right' })
      doc.y = y + 19
    }
  }

  // Accounts
  p.sectionTitle('Accounts', 'Balances today.')
  if (!accountRows.length) {
    p.empty('No accounts yet.')
  } else {
    const total = accountRows.reduce((sum, a) => sum + (a.converted ?? 0), 0)
    p.table(
      [
        { label: 'Account', width: width * 0.32 },
        { label: 'Type', width: width * 0.16 },
        { label: 'Currency', width: width * 0.12 },
        { label: 'Balance', width: width * 0.2, align: 'right' },
        { label: `In ${currency}`, width: width * 0.2, align: 'right' }
      ],
      accountRows.map((a) => [
        a.name,
        TYPE_LABELS[a.type] || a.type,
        a.currency,
        { value: money(a.balance, a.currency), color: a.balance < 0 ? COLOR.down : COLOR.ink },
        a.converted === null ? '-' : money(a.converted, currency)
      ]),
      { totalRow: ['Total', '', '', '', money(total, currency)] }
    )
  }

  // Investments
  const holdings = portfolio.holdings.filter((h) => Number(h.quantity) > 0)
  p.sectionTitle('Investments', holdings.length ? 'Market value at the latest prices; P&L includes fees.' : undefined)
  if (!holdings.length) {
    p.empty('No investments yet.')
  } else {
    const gain = portfolio.totalUnrealizedGain
    const gainPct = portfolio.totalCostBasis > 0 ? Math.round((gain / portfolio.totalCostBasis) * 1000) / 10 : null
    const stats = [
      ['Portfolio value', money(portfolio.totalValue, currency), COLOR.ink],
      ['Capital invested', money(portfolio.totalCostBasis, currency), COLOR.ink],
      ['Unrealized P&L', `${signedMoney(gain, currency)}${gainPct !== null ? ` · ${pct(gainPct, { signed: true })}` : ''}`, gain >= 0 ? COLOR.up : COLOR.down],
      ['Return per year', xirr.available ? pct(xirr.xirr, { signed: true }) : '-', xirr.available && xirr.xirr < 0 ? COLOR.down : COLOR.up]
    ]
    p.ensureSpace(46)
    const y = doc.y
    const statW = width / 4
    stats.forEach(([label, value, color], i) => {
      p.text(label.toUpperCase(), left + i * statW, y, { font: 'Bold', size: 7.5, color: COLOR.muted, width: statW - 8 })
      p.text(value, left + i * statW, y + 13, { font: 'Bold', size: 9.5, color, width: statW - 8 })
    })
    doc.y = y + 38
    p.table(
      [
        { label: 'Holding', width: width * 0.25 },
        { label: 'Quantity', width: width * 0.15, align: 'right' },
        { label: 'Last price', width: width * 0.18, align: 'right' },
        { label: `Value (${currency})`, width: width * 0.24, align: 'right' },
        { label: 'P&L', width: width * 0.18, align: 'right' }
      ],
      [...holdings].sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0)).map((h) => {
        const ret = h.returnPercentage
        return [
          h.asset_name,
          quantity(h.quantity),
          money(Number(h.current_price), h.currency),
          h.currentValue === null ? '-' : money(h.currentValue, currency),
          { value: pct(ret, { signed: true }), color: ret === null || ret === undefined ? COLOR.muted : ret >= 0 ? COLOR.up : COLOR.down }
        ]
      }),
      { totalRow: ['Total', '', '', money(portfolio.totalValue, currency), { value: pct(gainPct, { signed: true }), color: gain >= 0 ? COLOR.up : COLOR.down }] }
    )
  }

  // Goals
  if (goals.length) {
    p.sectionTitle('Goals')
    p.table(
      [
        { label: 'Goal', width: width * 0.3 },
        { label: 'Saved', width: width * 0.2, align: 'right' },
        { label: 'Target', width: width * 0.2, align: 'right' },
        { label: 'Progress', width: width * 0.14, align: 'right' },
        { label: 'Target date', width: width * 0.16, align: 'right' }
      ],
      goals.map((g) => [
        g.name,
        money(Number(g.saved_amount), g.currency || currency),
        money(Number(g.target_amount), g.currency || currency),
        { value: pct(g.progressPercentage), color: g.isComplete ? COLOR.up : COLOR.ink, bold: g.isComplete },
        g.target_date ? day(g.target_date) : '-'
      ])
    )
  }

  // Transactions
  p.sectionTitle('Transactions', `${transactions.length} recorded in this cycle, newest first.`)
  if (!transactions.length) {
    p.empty('No transactions in this cycle.')
  } else {
    p.table(
      [
        { label: 'Date', width: width * 0.15 },
        { label: 'Category', width: width * 0.19 },
        { label: 'Account', width: width * 0.17 },
        { label: 'Notes', width: width * 0.29 },
        { label: 'Amount', width: width * 0.2, align: 'right' }
      ],
      transactions.map((t) => {
        const account = data.accountById.get(t.account_id)
        const income = t.type === 'income'
        return [
          day(t.occurred_at),
          data.categoryNames.get(t.category_id) || 'Uncategorized',
          account?.name || '-',
          t.notes || '',
          { value: `${income ? '+' : '-'}${money(Number(t.amount), account?.currency || currency)}`, color: income ? COLOR.up : COLOR.ink }
        ]
      })
    )
  }

  // Footer on every page
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Written inside the bottom margin, which would otherwise start a new page.
    doc.page.margins.bottom = 0
    const y = doc.page.height - PAGE.margin + 8
    doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.5).strokeColor(COLOR.line).stroke()
    p.text(`NextGen Wealth · Financial report · ${summary.periodLabel}`, left, y, { size: 8, color: COLOR.faint, width: width / 2 })
    p.text(`Page ${i - range.start + 1} of ${range.count}`, left + width / 2, y, { size: 8, color: COLOR.faint, width: width / 2, align: 'right' })
  }
  doc.end()
})

// --- Entry point --------------------------------------------------------

const SUPPORTED_FORMATS = ['pdf']

const exportReport = async (userId, { format = 'pdf', periodOffset } = {}) => {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw badRequest(`format must be one of: ${SUPPORTED_FORMATS.join(', ')}`)
  }
  const data = await gatherReport(userId, { periodOffset })
  const buffer = await generatePdfBuffer(data)
  return { buffer, contentType: 'application/pdf', filename: `nextgen-wealth-report-${data.breakdown.period || 'cycle'}.pdf` }
}

module.exports = { exportReport, SUPPORTED_FORMATS }
