// The app's mark: a rising line with an arrowhead on a rounded green square,
// the usual sign of growing money. Drawn as SVG so it stays sharp at any size.
export default function Logo({ size = 40, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#059669" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" stroke="white" strokeOpacity="0.18" />
      <path d="M9.5 27 L16.5 19.5 L21.5 24 L30 13.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 13.5 H30 V19.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
