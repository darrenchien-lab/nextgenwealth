'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleHelp, Loader2, Send, Trash2, X } from 'lucide-react'
import { request } from '@/lib/apiClient'

const SUGGESTIONS = [
  'How do I add a transaction?',
  'How do budgets work?',
  'How do I record buying a stock?',
  'What does "budget cycle" mean?'
]

// A floating "Help" chat on every page: people type a question about using
// the app and get a short, step-by-step answer, with buttons to the pages it
// mentions. It only explains the app. It sees none of the person's money.
export default function HelpAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [open, messages, sending])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function ask(text) {
    const question = text.trim()
    if (!question || sending) return
    setError('')
    setInput('')
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }))
    setMessages((list) => [...list, { role: 'user', text: question }])
    setSending(true)
    try {
      const data = await request('/help/ask', { method: 'POST', body: JSON.stringify({ question, history }) })
      setMessages((list) => [...list, { role: 'assistant', text: data.answer, links: data.links || [] }])
    } catch (err) {
      setError(err.message || "We couldn't answer that right now. Please try again.")
    } finally {
      setSending(false)
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    ask(input)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask(input)
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Help"
          className="pop-in fixed bottom-24 right-4 z-40 flex h-[34rem] max-h-[calc(100vh-8rem)] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 sm:right-6"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><CircleHelp size={17} /></span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Help</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ask how to use the app</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setError('') }} aria-label="Start a new chat" title="Start a new chat" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"><Trash2 size={15} /></button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"><X size={16} /></button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 text-sm text-gray-700 dark:bg-gray-700/70 dark:text-gray-200">
                  Hi! Not sure how something works? Ask me, in English or Indonesian, and I&apos;ll walk you through it.
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="rounded-full border border-gray-200 px-3 py-1.5 text-left text-xs font-medium text-gray-600 transition-colors duration-150 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start gap-2'}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-emerald-600 px-3.5 py-2.5 text-sm text-white'
                  : 'max-w-[92%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 text-sm text-gray-700 dark:bg-gray-700/70 dark:text-gray-200'}>
                  {m.text}
                </div>
                {m.links?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.links.map((l) => (
                      <Link key={l.href} href={l.href} className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800/40 dark:hover:bg-emerald-900/50">
                        Open {l.label} <ArrowRight size={12} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500"><Loader2 size={14} className="animate-spin" /> Thinking…</div>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="border-t border-gray-100 p-3 dark:border-gray-700">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={500}
                placeholder="Ask how to do something…"
                className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <button type="submit" disabled={sending || !input.trim()} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors duration-150 hover:bg-emerald-700 disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-400 dark:text-gray-500">Answers come from the app&apos;s guide and can be imperfect. Your questions are answered by an AI model that runs on our own server, but please don&apos;t include personal details.</p>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close help' : 'Open help'}
        className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg ring-1 ring-gray-200 transition-colors duration-150 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700 sm:right-6"
      >
        {open ? <X size={18} /> : <CircleHelp size={18} className="text-blue-600 dark:text-blue-400" />}
        <span className={open ? 'hidden' : 'hidden sm:inline'}>Help</span>
      </button>
    </>
  )
}
