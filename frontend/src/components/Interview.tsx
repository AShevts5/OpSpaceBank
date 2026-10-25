import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BackIcon, CheckIcon, CrossIcon } from './Icons'

export type Answer = boolean | number

export interface InterviewQuestion {
  key: string
  text: string
  hint?: string
  kind: 'yesno' | 'number'
  unit?: string
  placeholder?: string
  /** как показать ответ в сводке */
  format?: (v: Answer) => string
}

/** Опрос клиента: по одному вопросу на экране, «Да/Нет» сразу переходит к следующему. */
export function Interview({ questions, onComplete, intro }: { questions: InterviewQuestion[]; onComplete: (answers: Record<string, Answer>) => void; intro?: ReactNode }) {
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [num, setNum] = useState('')
  const q = questions[i]

  const answer = (v: Answer) => {
    const next = { ...answers, [q.key]: v }
    setAnswers(next)
    if (i + 1 >= questions.length) onComplete(next)
    else {
      const nq = questions[i + 1]
      setNum(nq.kind === 'number' && typeof next[nq.key] === 'number' ? String(next[nq.key]) : '')
      setI(i + 1)
    }
  }

  const back = () => {
    const pq = questions[i - 1]
    setNum(pq.kind === 'number' && typeof answers[pq.key] === 'number' ? String(answers[pq.key]) : '')
    setI(i - 1)
  }

  const submitNumber = (e: FormEvent) => {
    e.preventDefault()
    const v = Number(num.replace(/\s/g, '').replace(',', '.'))
    if (num.trim() !== '' && Number.isFinite(v) && v >= 0) answer(v)
  }

  return (
    <div className="card interview">
      {intro && i === 0 ? <div className="interview__intro">{intro}</div> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          Вопрос {i + 1} из {questions.length}
        </span>
        {i > 0 ? (
          <button type="button" className="btn btn--quiet" onClick={back} style={{ paddingInline: 10 }}>
            <BackIcon width={16} height={16} /> Назад
          </button>
        ) : null}
      </div>
      <div className="quiz__bar">
        <i style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={q.key} className="grid gap-4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
          <div className="grid gap-1">
            <h2 className="interview__q">{q.text}</h2>
            {q.hint ? <p className="muted text-sm">{q.hint}</p> : null}
          </div>
          {q.kind === 'yesno' ? (
            <div className="interview__yn">
              <button type="button" className={`interview__btn is-yes ${answers[q.key] === true ? 'is-picked' : ''}`} onClick={() => answer(true)}>
                <CheckIcon /> Да
              </button>
              <button type="button" className={`interview__btn is-no ${answers[q.key] === false ? 'is-picked' : ''}`} onClick={() => answer(false)}>
                <CrossIcon /> Нет
              </button>
            </div>
          ) : (
            <form className="flex flex-wrap gap-2 items-center" onSubmit={submitNumber}>
              <input className="input interview__num" inputMode="numeric" autoFocus value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d\s.,]/g, ''))} placeholder={q.placeholder} aria-label={q.text} />
              {q.unit ? <span className="muted">{q.unit}</span> : null}
              <button type="submit" className="btn btn--primary" disabled={num.trim() === ''}>
                Далее
              </button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export function AnswersSummary({ questions, answers }: { questions: InterviewQuestion[]; answers: Record<string, Answer> }) {
  return (
    <ul className="answers">
      {questions.map((q) => {
        const v = answers[q.key]
        const text = q.format ? q.format(v) : typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : `${v.toLocaleString('ru-RU')}${q.unit ? ' ' + q.unit : ''}`
        return (
          <li key={q.key}>
            <span>{q.text}</span>
            <b className={typeof v === 'boolean' ? (v ? 'is-yes' : 'is-no') : ''}>{text}</b>
          </li>
        )
      })}
    </ul>
  )
}

export function Verdict({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  return (
    <motion.div className={`verdict ${ok ? 'verdict--ok' : 'verdict--miss'}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <span className="stamp">{ok ? <CheckIcon /> : <CrossIcon />}</span>
      <div className="grid gap-1">
        <h3>{title}</h3>
        {children}
      </div>
    </motion.div>
  )
}
