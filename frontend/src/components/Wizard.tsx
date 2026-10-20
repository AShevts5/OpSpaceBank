import { useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Question, VarInfo } from '../logic/tasks'
import { CheckIcon, CrossIcon } from './Icons'

/**
 * Наводящие вопросы: пользователь сам проходит ход решения.
 * Ошибка не блокирует — показываем объяснение и идём дальше; в конце итог и ответ.
 */
export function Wizard({ questions, final, onDone }: { questions: Question[]; final: ReactNode; onDone?: (score: number, total: number) => void }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [hint, setHint] = useState(false)
  const finished = i >= questions.length

  if (finished) {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <motion.div className="grid gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="card quiz">
          <p className="eyebrow">Наводящие вопросы пройдены</p>
          <h2 className="font-display text-2xl font-bold">
            {score} из {questions.length} верно · {pct}%
          </h2>
          <p className="muted">
            {pct === 100 ? 'Отлично — вы решили задачу полностью самостоятельно.' : pct >= 60 ? 'Хороший результат! Посмотрите объяснения к ошибкам в пошаговом решении.' : 'Стоит ещё раз пройти пошаговое решение — там каждый закон разобран подробно.'}
          </p>
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setI(0)
                setScore(0)
                setPicked(null)
              }}
            >
              Пройти заново
            </button>
          </div>
        </div>
        {final}
      </motion.div>
    )
  }

  const q = questions[i]
  const answered = picked !== null
  const choose = (k: number) => {
    if (answered) return
    setPicked(k)
    if (k === q.correct) setScore((s) => s + 1)
  }
  const next = () => {
    const last = i + 1 >= questions.length
    const total = score
    setPicked(null)
    setHint(false)
    setI(i + 1)
    if (last) onDone?.(total, questions.length)
  }

  return (
    <div className="card quiz" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          Вопрос {i + 1} из {questions.length}
        </span>
        <span className="tag tag--ok">верно: {score}</span>
      </div>
      <div className="quiz__bar">
        <i style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>
      <motion.p key={i} className="quiz__q" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
        {q.q}
      </motion.p>
      <div className="quiz__opts">
        {q.options.map((o, k) => {
          const cls = answered ? (k === q.correct ? 'is-right' : k === picked ? 'is-wrong' : '') : ''
          return (
            <button key={k} type="button" className={`quiz__opt ${cls}`} onClick={() => choose(k)} disabled={answered}>
              <b>{answered && k === q.correct ? <CheckIcon width={14} height={14} /> : answered && k === picked ? <CrossIcon width={14} height={14} /> : String.fromCharCode(1040 + k)}</b>
              <span className="font-mono">{o}</span>
            </button>
          )
        })}
      </div>
      {!answered && q.hint ? (
        hint ? (
          <p className="law">💡 {q.hint}</p>
        ) : (
          <button type="button" className="auth__link justify-self-start" onClick={() => setHint(true)}>
            Подсказка
          </button>
        )
      ) : null}
      {answered ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3">
          <p className="quiz__explain" style={{ background: picked === q.correct ? 'var(--ok-soft)' : 'var(--miss-soft)' }}>
            <b>{picked === q.correct ? 'Верно. ' : 'Не совсем. '}</b>
            {q.explain}
          </p>
          <div>
            <button type="button" className="btn btn--primary" onClick={next}>
              {i + 1 >= questions.length ? 'Узнать результат' : 'Следующий вопрос'}
            </button>
          </div>
        </motion.div>
      ) : null}
    </div>
  )
}

/** «Проверить клиента»: отвечаем «да/нет» на вопросы — получаем решение и объяснение. */
export function Checker({
  vars,
  decide,
  formula,
  extra,
  onCheck,
}: {
  vars: VarInfo[]
  decide: (bits: number[]) => { approved: boolean; reason: string; minterm?: number }
  formula: string
  extra?: ReactNode
  onCheck?: (bits: number[], approved: boolean) => void
}) {
  const [vals, setVals] = useState<(number | null)[]>(vars.map(() => null))
  const ready = vals.every((v) => v !== null)
  const bits = vals.map((v) => v ?? 0)
  const res = ready ? decide(bits) : null
  const set = (i: number, v: number) => {
    const next = vals.map((x, k) => (k === i ? v : x))
    setVals(next)
    if (next.every((x) => x !== null)) onCheck?.(next as number[], decide(next as number[]).approved)
  }
  return (
    <div className="grid gap-4">
      <div className="ask">
        {vars.map((v, i) => (
          <div key={v.key} className="ask__row">
            <span>
              <b>{v.key}</b>
              <span>{v.ask}</span>
            </span>
            <span className="yn" role="group" aria-label={v.ask}>
              <button type="button" className="is-yes" aria-pressed={vals[i] === 1} onClick={() => set(i, 1)}>
                Да
              </button>
              <button type="button" className="is-no" aria-pressed={vals[i] === 0} onClick={() => set(i, 0)}>
                Нет
              </button>
            </span>
          </div>
        ))}
      </div>
      {extra}
      {res ? (
        <motion.div key={bits.join('')} className={`verdict ${res.approved ? 'verdict--ok' : 'verdict--miss'}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <span className="stamp">{res.approved ? <CheckIcon /> : <CrossIcon />}</span>
          <div className="grid gap-1">
            <h3>{res.approved ? 'Одобрено' : 'Отказ'}</h3>
            <p>{res.reason}</p>
            <p className="font-mono text-sm muted">
              {formula} при {vars.map((v, i) => `${v.key}=${bits[i]}`).join(', ')}
              {res.minterm !== undefined ? ` (набор m${res.minterm})` : ''} → {res.approved ? 1 : 0}
            </p>
          </div>
        </motion.div>
      ) : (
        <p className="muted text-sm">Ответьте на все вопросы — система примет решение по минимизированному правилу и объяснит его.</p>
      )}
    </div>
  )
}
