import { Check } from 'lucide-react'

// Heuristic only, for user feedback — the backend's actual requirement stays
// a simple 8-character minimum, so only that rule blocks submission.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8, required: true },
  { label: 'Upper and lower case letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /[0-9]/.test(p) },
  { label: 'A symbol', test: (p) => /[^A-Za-z0-9]/.test(p) }
]

function getStrength(password) {
  let score = PASSWORD_RULES.filter((r) => r.test(password)).length
  if (password.length >= 12) score += 1
  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500', text: 'text-red-600 dark:text-red-400' }
  if (score <= 3) return { score, label: 'Fair', color: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
  if (score === 4) return { score, label: 'Good', color: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' }
  return { score, label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
}

export default function PasswordStrength({ password }) {
  if (!password) return null
  const { score, label, color, text } = getStrength(password)

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < score ? color : 'bg-gray-200 dark:bg-gray-700'}`} />
          ))}
        </div>
        <span className={`text-xs font-medium ${text}`}>{label}</span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password)
          return (
            <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <Check className={`h-3.5 w-3.5 ${ok ? '' : 'opacity-30'}`} />
              {rule.label}{rule.required && !ok ? ' *' : ''}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
