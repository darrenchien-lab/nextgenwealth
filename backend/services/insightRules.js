'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const aggregates = require('../shared/financialAggregates')
const periods = require('../shared/periods')
const currencyService = require('./currency')
const accountsService = require('./accounts')
const budgetsService = require('./budgets')
const billsService = require('./bills')
const savingsGoalsService = require('./savingsGoals')

const SQL = {
  listCategoryNames: loadSql('insights/listCategoryNames'),
  listRecentExpenses: loadSql('insights/listRecentExpenses')
}

// The built-in insight engine. Every finding is worked out from the same
// aggregates the dashboard and reports use, and compares budget cycles (not
// calendar months), so the numbers here always agree with the rest of the app.
// Each finding: { id, tone: 'warning' | 'positive' | 'info', title, text, href }.
// Written to the person ("you"), in plain words.

const money = (amount, currency) => {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: currency === 'IDR' || !currency ? 0 : 2
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency || ''}`.trim()
  }
}

const pct = (n) => `${Math.round(n)}%`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const dayLabel = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// How this cycle's spending is going: against the same point last cycle and,
// once there are a few days of data, where it is heading and what a day can cost.
const spendingOutlook = ({ trendNow, trendBefore, daysLeft }) => {
  const elapsed = trendNow.days.length
  if (elapsed < 4 || trendBefore.days.length < elapsed) return []
  const cur = trendNow.displayCurrency
  const now = trendNow.days[elapsed - 1].expense
  const before = trendBefore.days[elapsed - 1].expense
  const lastTotal = trendBefore.days[trendBefore.days.length - 1].expense
  if (before <= 0 || lastTotal <= 0) return []

  const change = (now - before) / before
  let tone = 'info'
  let title = 'Where this cycle is heading'
  let lead = null
  if (change >= 0.2) {
    tone = 'warning'
    title = 'You are spending faster than last cycle'
    lead = `You have spent ${money(now, cur)} in ${plural(elapsed, 'day')}, ${pct(change * 100)} more than at this point last cycle (${money(before, cur)}).`
  } else if (change <= -0.2) {
    tone = 'positive'
    title = 'You are spending less than last cycle'
    lead = `You have spent ${money(now, cur)} in ${plural(elapsed, 'day')}, ${pct(Math.abs(change) * 100)} less than at this point last cycle (${money(before, cur)}).`
  }

  let outlook = null
  if (elapsed >= 7 && daysLeft > 0) {
    const projected = (now / elapsed) * trendNow.totalDays
    const room = lastTotal - now
    outlook = `At this pace you will spend about ${money(projected, cur)} this cycle, against ${money(lastTotal, cur)} last cycle. `
      + (room > 0
        ? `To stay at or below last cycle, keep it to about ${money(room / daysLeft, cur)} a day for the next ${plural(daysLeft, 'day')}.`
        : 'You have already spent more than all of last cycle.')
  }
  if (!lead && !outlook) return []
  return [{ id: 'outlook', tone, href: '/dashboard', title, text: [lead, outlook].filter(Boolean).join(' ') }]
}

// Categories already above (or far ahead of) what they cost in the whole last cycle.
const categorySpikes = ({ breakdownNow, breakdownBefore, daysLeft }) => {
  const before = new Map(breakdownBefore.breakdown.map((b) => [b.categoryId ?? 'none', b.amount]))
  const cur = breakdownNow.displayCurrency
  const minJump = breakdownBefore.total * 0.03
  return breakdownNow.breakdown
    .map((b) => ({ ...b, before: before.get(b.categoryId ?? 'none') || 0 }))
    .filter((b) => b.before > 0 && b.amount > b.before * 1.3 && b.amount - b.before >= minJump)
    .sort((a, b) => (b.amount - b.before) - (a.amount - a.before))
    .slice(0, 2)
    .map((b) => ({
      id: `spike-${b.categoryId ?? 'none'}`, tone: 'warning', href: '/transactions',
      title: `${b.categoryName} is running high`,
      text: `You have spent ${money(b.amount, cur)} on ${b.categoryName}, already ${pct(((b.amount - b.before) / b.before) * 100)} more than all of last cycle (${money(b.before, cur)})${daysLeft > 0 ? `, with ${plural(daysLeft, 'day')} still to go` : ''}.`
    }))
}

// One category taking most of the spending.
const concentration = ({ breakdownNow }) => {
  if (breakdownNow.breakdown.length < 2) return []
  const top = [...breakdownNow.breakdown].sort((a, b) => b.amount - a.amount)[0]
  if (top.percentage < 40) return []
  return [{
    id: 'concentration', tone: 'info', href: '/reports',
    title: `${top.categoryName} is your biggest cost`,
    text: `${top.percentage}% of what you have spent this cycle (${money(top.amount, breakdownNow.displayCurrency)}) went to ${top.categoryName}.`
  }]
}

// The savings rate of the last finished cycle against the one before it, and
// whether this cycle is spending more than it earns.
const savings = ({ monthly }) => {
  const out = []
  const [, older, last, now] = monthly
  const rate = (t) => (t && t.income > 0 ? (t.income - t.expense) / t.income : null)
  const lastRate = rate(last)
  const olderRate = rate(older)
  if (lastRate !== null && olderRate !== null) {
    const delta = Math.round((lastRate - olderRate) * 1000) / 10
    if (delta >= 2) {
      out.push({ id: 'savings-up', tone: 'positive', href: '/reports', title: 'You saved more than before', text: `You kept ${pct(lastRate * 100)} of your income last cycle, ${delta} points more than the cycle before.` })
    } else if (delta <= -2) {
      out.push({ id: 'savings-down', tone: 'warning', href: '/reports', title: 'You saved less than before', text: `You kept ${pct(lastRate * 100)} of your income last cycle, ${Math.abs(delta)} points less than the cycle before.` })
    }
  }
  if (now && now.income > 0 && now.expense > now.income) {
    out.push({
      id: 'overspent', tone: 'warning', href: '/transactions',
      title: 'You are spending more than you earn',
      text: `So far this cycle you have spent ${money(now.expense, now.displayCurrency)} and earned ${money(now.income, now.displayCurrency)}.`
    })
  }
  return out
}

// Budgets that are over, or close to it.
const budgets = async ({ userId, daysLeft, categoryNames }) => {
  const list = await budgetsService.listBudgetsWithUsage(userId)
  if (list.length === 0) return []
  const out = []
  for (const b of list) {
    const limit = Number(b.limit_amount)
    const name = categoryNames.get(b.category_id) || 'A category'
    const used = b.spent / limit
    if (used > 1) {
      out.push({ id: `budget-over-${b.id}`, tone: 'warning', href: '/budgets', title: `${name} is over budget`, text: `You have spent ${money(b.spent, b.currency)} against a budget of ${money(limit, b.currency)}, which is ${money(b.spent - limit, b.currency)} over.` })
    } else if (used >= 0.85) {
      const perDay = daysLeft > 0 ? ` That is about ${money((limit - b.spent) / daysLeft, b.currency)} a day for the next ${plural(daysLeft, 'day')}.` : ''
      out.push({ id: `budget-near-${b.id}`, tone: 'warning', href: '/budgets', title: `${name} budget is almost used up`, text: `You have used ${pct(used * 100)} of it and have ${money(limit - b.spent, b.currency)} left.${perDay}` })
    }
  }
  if (out.length === 0 && daysLeft <= 3) {
    out.push({ id: 'budgets-ok', tone: 'positive', href: '/budgets', title: 'You are within every budget', text: `Nice work. Every budget is still under its limit with ${plural(daysLeft, 'day')} left in this cycle.` })
  }
  return out
}

// Bills that are overdue or due within a week.
const bills = async ({ userId }) => {
  const upcoming = await billsService.listUpcomingBills(userId, 7)
  if (upcoming.length === 0) return []
  const overdue = upcoming.filter((b) => b.isOverdue)
  const soon = upcoming.filter((b) => !b.isOverdue)
  const names = (list) => list.slice(0, 3).map((b) => b.name).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '')
  const out = []
  if (overdue.length > 0) {
    out.push({ id: 'bills-overdue', tone: 'warning', href: '/bills', title: `${plural(overdue.length, 'bill')} past due`, text: `${names(overdue)} ${overdue.length === 1 ? 'is' : 'are'} past the due date. Paying soon avoids late fees.` })
  }
  if (soon.length > 0) {
    out.push({ id: 'bills-soon', tone: 'info', href: '/bills', title: `${plural(soon.length, 'bill')} due this week`, text: `${names(soon)} ${soon.length === 1 ? 'is' : 'are'} coming up in the next 7 days.` })
  }
  return out
}

// Savings goals that are done or nearly there.
const goals = async ({ userId }) => {
  const list = await savingsGoalsService.listGoals(userId)
  const out = []
  const done = list.find((g) => g.isComplete)
  if (done) out.push({ id: 'goal-done', tone: 'positive', href: '/goals', title: 'You reached a goal', text: `Your "${done.name}" goal is fully funded. Well done!` })
  const near = list.find((g) => !g.isComplete && g.progressPercentage >= 80)
  if (near) out.push({ id: `goal-near-${near.id}`, tone: 'positive', href: '/goals', title: 'You are close to a goal', text: `"${near.name}" is ${near.progressPercentage}% funded. Just a little more to go.` })
  return out
}

// Expenses over the last few cycles, converted to the display currency and
// tagged with the cycle they count in.
const loadExpenseHistory = async ({ userId, cycleStartDay, displayCurrency }) => {
  const { start } = periods.getPeriodBoundsForOffset(cycleStartDay, 3)
  const rows = (await query(SQL.listRecentExpenses, [userId, start])).rows
  // One exchange rate per currency, not one lookup per transaction.
  const rates = new Map()
  const rateFor = async (currency) => {
    if (!rates.has(currency)) rates.set(currency, await currencyService.getRate(currency, displayCurrency))
    return rates.get(currency)
  }
  const out = []
  for (const row of rows) {
    const rate = await rateFor(row.currency)
    if (rate === null) continue
    const [y, m, d] = row.day.split('-').map(Number)
    out.push({ ...row, converted: Number(row.amount) * rate, period: periods.periodKeyForDate(cycleStartDay, new Date(y, m - 1, d)) })
  }
  return out
}

// A purchase this cycle far bigger than that category usually costs.
const unusualPurchases = ({ history, currentPeriod, categoryNames, monthly, displayCurrency }) => {
  const past = history.filter((h) => h.period !== currentPeriod)
  const now = history.filter((h) => h.period === currentPeriod)
  const finished = monthly.slice(0, -1).filter((t) => t.expense > 0)
  if (finished.length === 0) return []
  const averageCycle = finished.reduce((sum, t) => sum + t.expense, 0) / finished.length

  const byCategory = new Map()
  for (const h of past) {
    const key = h.category_id ?? 'none'
    byCategory.set(key, [...(byCategory.get(key) || []), h.converted])
  }
  return now
    .map((h) => {
      const usual = byCategory.get(h.category_id ?? 'none')
      return usual && usual.length >= 5 ? { ...h, usual: median(usual) } : null
    })
    .filter((h) => h && h.converted >= h.usual * 3 && h.converted >= averageCycle * 0.05)
    .sort((a, b) => b.converted / b.usual - a.converted / a.usual)
    .slice(0, 2)
    .map((h) => {
      const name = categoryNames.get(h.category_id) || 'this category'
      return {
        id: `unusual-${h.id}`, tone: 'info', href: '/transactions',
        title: `A big ${name} purchase`,
        text: `${money(h.converted, displayCurrency)} on ${dayLabel(h.day)}${h.notes ? ` ("${h.notes}")` : ''} is about ${Math.round(h.converted / h.usual)} times what you usually spend at once on ${name}. If that was planned, ignore this.`
      }
    })
}

// Charges that come back cycle after cycle (subscriptions and the like).
const recurringCharges = ({ history, displayCurrency }) => {
  const groups = new Map()
  for (const h of history) {
    const key = String(h.notes || '').toLowerCase().replace(/[^a-z]+/g, '')
    if (key.length < 3) continue
    groups.set(key, [...(groups.get(key) || []), h])
  }
  const found = []
  for (const items of groups.values()) {
    const cycles = new Set(items.map((i) => i.period))
    if (cycles.size < 3) continue
    // A subscription is about one charge a cycle; lunch bought every day is not one.
    if (items.length > cycles.size * 2) continue
    const amounts = items.map((i) => i.converted)
    const mid = median(amounts)
    if (!amounts.every((a) => Math.abs(a - mid) <= mid * 0.15)) continue
    found.push({ name: items[items.length - 1].notes, amount: mid })
  }
  return found
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2)
    .map((f, i) => ({
      id: `recurring-${i}`, tone: 'info', href: '/transactions',
      title: `"${f.name}" repeats every cycle`,
      text: `It costs about ${money(f.amount, displayCurrency)} each time, roughly ${money(f.amount * 12, displayCurrency)} a year. Worth checking that you still use it.`
    }))
}

const TONE_ORDER = { warning: 0, info: 1, positive: 2 }
const MAX_ITEMS = 8

const generate = async (userId) => {
  const [trendNow, trendBefore, breakdownNow, breakdownBefore, monthly, cycleStartDay, categoryRows] = await Promise.all([
    aggregates.getCycleTrend(userId, { periodOffset: 0 }),
    aggregates.getCycleTrend(userId, { periodOffset: 1 }),
    aggregates.getExpenseBreakdown(userId, { periodOffset: 0 }),
    aggregates.getExpenseBreakdown(userId, { periodOffset: 1 }),
    aggregates.getMonthlyTrend(userId, 4),
    accountsService.getCycleStartDay(userId),
    query(SQL.listCategoryNames, [userId]).then((r) => r.rows)
  ])
  const displayCurrency = trendNow.displayCurrency
  const daysLeft = Math.max(0, trendNow.totalDays - trendNow.days.length)
  const categoryNames = new Map(categoryRows.map((c) => [c.id, c.name]))
  const currentPeriod = periods.periodKeyForDate(cycleStartDay, new Date())
  let history = []
  try {
    history = await loadExpenseHistory({ userId, cycleStartDay, displayCurrency })
  } catch (err) {
    console.error('Insight history failed:', err.message)
  }
  const context = { userId, trendNow, trendBefore, breakdownNow, breakdownBefore, monthly, daysLeft, categoryNames, displayCurrency, currentPeriod, history }

  const detectors = [spendingOutlook, categorySpikes, concentration, savings, budgets, bills, goals, unusualPurchases, recurringCharges]
  const found = []
  for (const detect of detectors) {
    try {
      found.push(...(await detect(context)))
    } catch (err) {
      // One detector failing shouldn't take the rest down.
      console.error(`Insight detector ${detect.name} failed:`, err.message)
    }
  }

  const items = found
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
    .slice(0, MAX_ITEMS)
  if (items.length === 0) {
    items.push({ id: 'quiet', tone: 'info', href: null, title: 'Nothing unusual so far', text: 'Your spending, budgets and bills all look normal this cycle.' })
  }
  return items
}

// One sentence on how the cycle looks overall, from the counts.
const headline = (items) => {
  const attention = items.filter((i) => i.tone === 'warning').length
  const good = items.filter((i) => i.tone === 'positive').length
  if (attention === 0 && good === 0) return 'Everything looks steady this cycle.'
  const parts = []
  if (attention > 0) parts.push(`${plural(attention, 'thing')} ${attention === 1 ? 'needs' : 'need'} your attention`)
  if (good > 0) parts.push(`${plural(good, 'thing')} ${good === 1 ? 'is' : 'are'} going well`)
  return `${parts.join(' and ')} this cycle.`
}

module.exports = { generate, headline }
