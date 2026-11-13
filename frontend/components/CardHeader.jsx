const COLOR_STYLES = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-red-500 dark:text-red-400',
  blue: 'text-blue-600 dark:text-blue-400',
  amber: 'text-amber-600 dark:text-amber-400',
  violet: 'text-violet-600 dark:text-violet-400',
  slate: 'text-gray-500 dark:text-gray-400'
}

// Shared card header: a small tinted icon (no colored box behind it) and the
// title, so cards stay quiet and the numbers and charts stand out.
export default function CardHeader({ icon: Icon, color = 'slate', title, subtitle, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} strokeWidth={2.25} className={`shrink-0 ${COLOR_STYLES[color]}`} />}
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
