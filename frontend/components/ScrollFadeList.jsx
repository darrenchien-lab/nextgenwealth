'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// A fixed-height <ul> that scrolls, with a fade and a "+N more ↓" hint at
// the bottom while some rows are still out of view — scrollbars are often
// hidden until used, so without it a longer list looks like it simply ends.
// Clicking the hint scrolls down one view.
export default function ScrollFadeList({ className = '', children }) {
  const listRef = useRef(null)
  const [hiddenBelow, setHiddenBelow] = useState(0)

  const measure = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const visibleBottom = list.scrollTop + list.clientHeight
    let hidden = 0
    for (const row of list.children) {
      if (row.offsetTop + row.offsetHeight / 2 > visibleBottom) hidden += 1
    }
    setHiddenBelow(hidden)
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    // Re-measure when the list is resized or its rows change.
    const resize = new ResizeObserver(measure)
    const mutation = new MutationObserver(measure)
    resize.observe(list)
    mutation.observe(list, { childList: true })
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [measure])

  return (
    <div className="relative w-full">
      <ul ref={listRef} onScroll={measure} className={`relative overflow-y-auto ${className}`}>
        {children}
      </ul>
      {hiddenBelow > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-gradient-to-t from-white to-transparent dark:from-gray-800">
          <button
            type="button"
            onClick={() => listRef.current?.scrollBy({ top: listRef.current.clientHeight * 0.8, behavior: 'smooth' })}
            className="pointer-events-auto rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 hover:text-gray-800 dark:bg-gray-700/90 dark:text-gray-300 dark:ring-gray-600 dark:hover:text-white"
          >
            +{hiddenBelow} more ↓
          </button>
        </div>
      )}
    </div>
  )
}
