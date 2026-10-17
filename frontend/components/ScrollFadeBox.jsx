'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// The scrolling body of a fixed-height card: fills the space left under the
// card's header, scrolls when its content is taller, and shows a fade with
// a "More ↓" button while there's still content below (scrollbars are often
// hidden until used). Like ScrollFadeList, but for any content, not rows.
export default function ScrollFadeBox({ className = '', children }) {
  const boxRef = useRef(null)
  const [moreBelow, setMoreBelow] = useState(false)

  const measure = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    setMoreBelow(box.scrollTop + box.clientHeight < box.scrollHeight - 4)
  }, [])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return undefined
    const resize = new ResizeObserver(measure)
    resize.observe(box)
    for (const child of box.children) resize.observe(child)
    const mutation = new MutationObserver(measure)
    mutation.observe(box, { childList: true, subtree: true })
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [measure])

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={boxRef} onScroll={measure} className={`h-full overflow-y-auto ${className}`}>
        {children}
      </div>
      {moreBelow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-white to-transparent dark:from-gray-800">
          <button
            type="button"
            onClick={() => boxRef.current?.scrollBy({ top: boxRef.current.clientHeight * 0.8, behavior: 'smooth' })}
            className="pointer-events-auto rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 hover:text-gray-800 dark:bg-gray-700/90 dark:text-gray-300 dark:ring-gray-600 dark:hover:text-white"
          >
            More ↓
          </button>
        </div>
      )}
    </div>
  )
}
