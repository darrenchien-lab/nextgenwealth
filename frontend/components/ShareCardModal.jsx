'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { buildShareData, drawShareCard } from '@/lib/shareCard'

// Shows a preview of the shareable returns card (no asset names, no amounts)
// and downloads it as a PNG.
export default function ShareCardModal({ portfolio, onClose }) {
  const canvasRef = useRef(null)
  const data = useMemo(() => buildShareData(portfolio), [portfolio])
  const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    if (canvasRef.current) drawShareCard(canvasRef.current, data, dateLabel)
  }, [data, dateLabel])

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `portfolio-return-${new Date().toISOString().slice(0, 10)}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Share your returns</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Only percentages are shown — no asset names, amounts or quantities.</p>
        {data.total === null ? (
          <p className="py-8 text-center text-sm text-gray-400">No holdings with a return to share yet.</p>
        ) : (
          <>
            <canvas ref={canvasRef} className="w-full rounded-xl ring-1 ring-gray-200 dark:ring-gray-700" style={{ aspectRatio: '1080 / 1350' }} />
            <button onClick={download} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <Download size={16} /> Download PNG
            </button>
          </>
        )}
      </div>
    </div>
  )
}
