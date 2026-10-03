const COLOR_STYLES = {
  emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  red: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
  slate: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
}

// Shared small colored-icon header used across cards on Dashboard and other
// pages, so the same "icon badge + title" visual language reads as one
// consistent design system instead of each page inventing its own header.
export default function CardHeader({ icon: Icon, color = 'slate', title, subtitle, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && (
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${COLOR_STYLES[color]}`}>
            <Icon size={13} strokeWidth={2.5} />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
