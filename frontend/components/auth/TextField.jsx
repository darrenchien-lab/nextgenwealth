// A labelled input with a leading icon, styled like PasswordField so the
// sign-in forms read as one set.
export default function TextField({ label, icon: Icon, error, className = '', ...inputProps }) {
  return (
    <div className={className}>
      {label && <label htmlFor={inputProps.id} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />}
        <input
          {...inputProps}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-lg border bg-white py-2.5 text-sm text-gray-900 shadow-sm transition-colors duration-150 placeholder:text-gray-400 focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 ${Icon ? 'pl-9' : 'pl-3'} pr-3 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500' : 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-gray-700'}`}
        />
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
