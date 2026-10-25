import { useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { QMResult, Table } from '../logic/boolean'
import type { Step } from '../logic/tasks'
import { BookIcon } from './Icons'

export function TruthTable({ table, resultCols = 1, highlight, diffLast = false }: { table: Table; resultCols?: number; highlight?: number[]; diffLast?: boolean }) {
  const n = table.columns.length
  const firstRes = n - resultCols
  return (
    <div className="scroll-x">
      <table className="tt">
        <thead>
          <tr>
            <th>№</th>
            {table.columns.map((c, i) => (
              <th key={c} style={i >= firstRes ? { color: 'var(--accent)' } : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className={highlight?.includes(r) ? 'is-hl' : undefined}>
              <td className="is-zero">m{r}</td>
              {row.map((v, i) => {
                const res = i >= firstRes
                const diff = diffLast && i === n - 1 && row[n - 1] !== row[n - 2]
                return (
                  <td key={i} className={[res ? 'is-res' : '', v ? 'is-one' : 'is-zero', diff ? 'is-diff' : ''].join(' ')}>
                    {v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function QMStages({ qm }: { qm: QMResult }) {
  const primes = new Set(qm.prime_implicants.map((p) => p.pattern))
  return (
    <div className="grid gap-4">
      {qm.stages.map((s) => (
        <div key={s.stage} className="qm-stage">
          <p className="eyebrow">{s.stage === 0 ? 'Исходные минтермы по группам' : `Склеивание, шаг ${s.stage}`}</p>
          <div className="qm-groups">
            {s.groups.map((g) => (
              <div key={g.ones} className="qm-group">
                <small>{g.ones} ед.</small>
                {g.items.map((it) => (
                  <span key={it.pattern} className={`qm-item ${!it.used && primes.has(it.pattern) ? 'is-prime' : it.used ? 'is-used' : ''}`} title={it.term}>
                    <span>{it.pattern}</span>
                    <span>{it.label}</span>
                    <span>{it.used ? '✓' : '★'}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
          {s.merges.length ? (
            <ul className="grid gap-1 pl-1">
              {s.merges.map((m) => (
                <li key={m.a + m.b} className="qm-merge">
                  {m.a} + {m.b} → <b style={{ color: 'var(--ink)' }}>{m.result}</b> = {m.term}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">Склеивать больше нечего.</p>
          )}
        </div>
      ))}
      <p className="text-sm muted">
        ✓ — терм участвовал в склеивании, <span style={{ color: 'var(--gold)', fontWeight: 700 }}>★</span> — простая импликанта (дальше не склеивается).
      </p>
    </div>
  )
}

export function QMChart({ qm }: { qm: QMResult }) {
  const ess = new Set(qm.essential.map((p) => p.pattern))
  const red = new Set(qm.redundant.map((p) => p.pattern))
  return (
    <div className="grid gap-3">
      <div className="scroll-x">
        <table className="tt qm-chart">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Импликанта</th>
              {qm.minterms.map((m) => (
                <th key={m}>m{m}</th>
              ))}
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {qm.chart.map((row) => (
              <tr key={row.pattern} className={ess.has(row.pattern) ? 'is-ess' : red.has(row.pattern) ? 'is-red' : undefined}>
                <td style={{ textAlign: 'left' }}>
                  {row.term} <span className="muted">({row.pattern})</span>
                </td>
                {qm.minterms.map((m) => {
                  const only = row.covers[m] && qm.chart.filter((r) => r.covers[m]).length === 1
                  return (
                    <td key={m} className={`${row.covers[m] ? 'is-x' : ''} ${only ? 'is-only' : ''}`}>
                      {row.covers[m] ? '×' : ''}
                    </td>
                  )
                })}
                <td>
                  {ess.has(row.pattern) ? (
                    <span className="tag tag--ok">существенная</span>
                  ) : red.has(row.pattern) ? (
                    <span className="tag tag--miss">лишняя</span>
                  ) : (
                    <span className="tag">добираем</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm muted">Зелёная клетка — единственная отметка в столбце: этот набор покрывает только одна импликанта, значит, она существенная.</p>
    </div>
  )
}

function StepInner({ step, index, children }: { step: Step; index: number; children?: ReactNode }) {
  return (
    <>
      <span className="step__num">{index + 1}</span>
      <div className="step__body">
        <h3>{step.title}</h3>
        {step.law ? (
          <p className="law">
            <BookIcon width={18} height={18} style={{ flex: 'none', marginTop: 2 }} />
            <span>{step.law}</span>
          </p>
        ) : null}
        {step.text ? <p>{step.text}</p> : null}
        {step.formula ? <div className="formula">{step.formula}</div> : null}
        {step.table ? <TruthTable table={step.table} resultCols={step.table.resultCols} highlight={step.table.highlight} diffLast={step.table.columns.at(-1) === 'без скобок'} /> : null}
        {step.code ? <pre className="code">{step.code}</pre> : null}
        {children}
      </div>
    </>
  )
}

/**
 * Пошаговое решение: шаги открываются по одному («Следующий шаг») или все сразу,
 * в конце — карточка с ответом.
 */
export function StepByStep({ steps, renderBlock, answer, onFinish }: { steps: Step[]; renderBlock?: (s: Step) => ReactNode; answer: ReactNode; onFinish?: () => void }) {
  const [shown, setShown] = useState(1)
  const done = shown > steps.length
  const next = () => {
    setShown((s) => s + 1)
    if (shown === steps.length) onFinish?.()
  }
  return (
    <div className="grid gap-4">
      <ol className="steps">
        <AnimatePresence initial={false}>
          {steps.slice(0, shown).map((s, i) => (
            <motion.li key={s.title} className="card step" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <StepInner step={s} index={i}>
                {s.block && renderBlock ? renderBlock(s) : null}
              </StepInner>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {done ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          {answer}
        </motion.div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn--primary" onClick={next}>
            {shown === steps.length ? 'Показать ответ' : `Следующий шаг (${shown + 1} из ${steps.length})`}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setShown(steps.length + 1)
              onFinish?.()
            }}
          >
            Показать всё решение
          </button>
        </div>
      )}
    </div>
  )
}

export function Legend({ vars }: { vars: { key: string; label: string }[] }) {
  return (
    <div className="legend">
      {vars.map((v) => (
        <div key={v.key}>
          <b>{v.key}</b>
          <span>{v.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Отчёт по решению: все шаги сразу; highlightRow подсвечивает в таблицах строку клиента. */
export function StepList({ steps, renderBlock, highlightRow }: { steps: Step[]; renderBlock?: (s: Step) => ReactNode; highlightRow?: number }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => {
        const step = s.table && highlightRow !== undefined ? { ...s, table: { ...s.table, highlight: [highlightRow] } } : s
        return (
          <li key={s.title} className="card step">
            <StepInner step={step} index={i}>
              {s.block && renderBlock ? renderBlock(s) : null}
            </StepInner>
          </li>
        )
      })}
    </ol>
  )
}
