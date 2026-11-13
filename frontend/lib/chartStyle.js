// One look for every chart: the same tooltip, axis text, grid and income/expense
// colors everywhere, so charts on different pages read as one design.
// Recharts takes literal values, so colors come from the CSS variables in
// globals.css (which switch with dark mode).

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 10,
  color: 'var(--tooltip-text)',
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(15, 20, 29, 0.18)'
}

export const AXIS_FONT_SIZE = 11
export const AXIS_TICK = { fontSize: AXIS_FONT_SIZE, fill: 'var(--chart-axis, #667085)' }
export const GRID_STROKE = 'var(--chart-grid)'

// Calmer than pure green/red, still clearly "in" and "out".
export const INCOME_COLOR = '#2a9d7c'
export const EXPENSE_COLOR = '#e0705f'
