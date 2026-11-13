// A grey placeholder shaped like a page while its data loads, in place of a
// plain "Loading..." line: a row of cards, then two wide blocks.
export default function PageSkeleton() {
  const block = 'animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800'
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-24`} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${block} h-64`} />
        <div className={`${block} h-64`} />
      </div>
    </div>
  )
}
