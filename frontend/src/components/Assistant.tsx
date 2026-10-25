import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ApiError, api, streamChat } from '../lib/api'
import { useSession } from '../lib/session'
import { localAnswer, SUGGESTIONS } from '../logic/knowledge'
import { ChatIcon, CloseIcon, SendIcon } from './Icons'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  source?: string | null
  pending?: boolean
}

const OPEN_EVENT = 'osb-open-assistant'
const SESSION_KEY = 'osb-chat-session'

/** Открыть помощника из любого места (например, кнопкой «Спросить консультанта» в холле). */
export function openAssistant(prompt?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: prompt }))
}

const GREETING: Msg = {
  role: 'assistant',
  content: 'Здравствуйте! Я AI-консультант OpSpaceBank. Подскажу по кредиту, премиальной карте и закрытой распродаже, объясню любое решение системы — и отвечу на другие ваши вопросы.',
}

export default function Assistant({ context }: { context: string }) {
  const { status, online } = useSession()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([GREETING])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY)
    } catch {
      return null
    }
  })
  const list = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const remote = status === 'user' && online

  useEffect(() => {
    const on = (e: Event) => {
      setOpen(true)
      const prompt = (e as CustomEvent<string | undefined>).detail
      if (prompt) window.setTimeout(() => send(prompt), 50)
    }
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  })

  // восстановить последний диалог с сервера
  useEffect(() => {
    if (!open || !remote || !sessionId || msgs.length > 1) return
    api
      .chatMessages(sessionId)
      .then((rows) => rows.length && setMsgs([GREETING, ...rows.map((r) => ({ role: r.role, content: r.content, source: r.source }))]))
      .catch(() => {
        setSessionId(null)
        try {
          localStorage.removeItem(SESSION_KEY)
        } catch {
          /* noop */
        }
      })
  }, [open, remote, sessionId, msgs.length])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  function patchLast(fn: (m: Msg) => Msg) {
    setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])])
  }

  async function send(raw: string) {
    const q = raw.trim()
    if (!q || busy) return
    setText('')
    setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', pending: true }])
    setBusy(true)
    if (!remote) {
      await new Promise((r) => setTimeout(r, 350))
      patchLast(() => ({ role: 'assistant', content: localAnswer(q), source: 'offline' }))
      setBusy(false)
      return
    }
    abort.current = new AbortController()
    let got = ''
    try {
      await streamChat(
        { message: q, session_id: sessionId, context },
        {
          session: (id) => {
            setSessionId(id)
            try {
              localStorage.setItem(SESSION_KEY, id)
            } catch {
              /* noop */
            }
          },
          delta: (t) => {
            got += t
            patchLast((m) => ({ ...m, content: m.content + t }))
          },
          done: (source) => patchLast((m) => ({ ...m, pending: false, source })),
        },
        abort.current.signal,
      )
      if (!got.trim()) patchLast(() => ({ role: 'assistant', content: localAnswer(q), source: 'offline' }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const fallback = localAnswer(q)
      patchLast(() => ({
        role: 'assistant',
        content: e instanceof ApiError && e.status !== 0 ? `${e.message}\n\n${fallback}` : fallback,
        source: 'offline',
      }))
    } finally {
      patchLast((m) => ({ ...m, pending: false }))
      setBusy(false)
    }
  }

  function newChat() {
    abort.current?.abort()
    setSessionId(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* noop */
    }
    setMsgs([GREETING])
    setBusy(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(text)
    }
  }

  return (
    <div className="ai force-dark">
      <AnimatePresence>
        {open ? (
          <motion.section
            className="ai__panel"
            aria-label="AI-консультант"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <header className="ai__head">
              <div>
                <b>AI-консультант</b>
                <small>{remote ? 'Онлайн · отвечает языковая модель' : status === 'user' ? 'Офлайн · встроенная база знаний' : 'Гость · встроенная база знаний'}</small>
              </div>
              <button type="button" className="ai__new" onClick={newChat}>
                Новый чат
              </button>
              <button type="button" className="ai__x" onClick={() => setOpen(false)} aria-label="Закрыть">
                <CloseIcon width={18} height={18} />
              </button>
            </header>
            <div className="ai__list" ref={list} aria-live="polite">
              {msgs.map((m, i) => (
                <div key={i} className={`ai__msg ${m.role === 'user' ? 'ai__msg--me' : 'ai__msg--bot'} ${m.pending ? 'ai__typing' : ''}`}>
                  <p>{m.content || (m.pending ? 'Печатает' : '')}</p>
                  {m.role === 'assistant' && m.source && m.source !== 'llm' && i > 0 ? <small>ответ из встроенной базы знаний</small> : null}
                </div>
              ))}
            </div>
            <div className="ai__chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
            <form className="ai__form" onSubmit={submit}>
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Задайте вопрос…" aria-label="Вопрос консультанту" maxLength={4000} />
              <button type="submit" className="ai__send" disabled={!text.trim() || busy} aria-label="Отправить">
                <SendIcon width={20} height={20} />
              </button>
            </form>
          </motion.section>
        ) : null}
      </AnimatePresence>
      <button type="button" className="ai__fab" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Скрыть консультанта' : 'Открыть AI-консультанта'} aria-expanded={open}>
        {open ? <CloseIcon /> : <ChatIcon width={28} height={28} />}
      </button>
    </div>
  )
}
