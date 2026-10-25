import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { openAssistant } from '../components/Assistant'
import { AnswersSummary, Interview, Verdict } from '../components/Interview'
import type { Answer, InterviewQuestion } from '../components/Interview'
import { QMChart, QMStages, StepList } from '../components/Solution'
import { saveResult } from '../lib/store'
import {
  solveTask1,
  solveTask2,
  solveTask3,
  task1CheckLog,
  task1Decide,
  task2Classify,
  task3Decide,
  parseLogCsv,
  TASK1_EVENT_LOG,
  TASK2_CLIENTS,
  TASK3_VARIANTS,
} from '../logic/tasks'
import type { Client, LogRow, Step, TaskId, Variant } from '../logic/tasks'

interface Decision {
  ok: boolean
  title: string
  message: ReactNode
  /** номер строки таблицы истинности, соответствующей ответам клиента */
  row: number
  bits: Record<string, number>
  result: Record<string, unknown>
}

/**
 * Страница услуги: клиент отвечает на вопросы → система выносит решение →
 * ниже отчёт, как решение получено (логическая модель, таблица истинности и т. д.).
 */
function ServicePage({
  id,
  num,
  title,
  lead,
  questions,
  decide,
  report,
  extra,
  labels,
}: {
  id: TaskId
  num: number
  title: string
  lead: string
  questions: InterviewQuestion[]
  decide: (a: Record<string, Answer>) => Decision
  report: (d: Decision, a: Record<string, Answer>) => ReactNode
  extra?: ReactNode
  labels: Record<string, string>
}) {
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null)
  const [round, setRound] = useState(0)
  const decision = answers ? decide(answers) : null

  const finish = (a: Record<string, Answer>) => {
    const d = decide(a)
    setAnswers(a)
    saveResult({ task: id, mode: 'service', input: a as Record<string, unknown>, result: { approved: d.ok, ...d.result } })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="wrap page">
      <div className="page__head">
        <p className="eyebrow">Окно {num}</p>
        <h1>{title}</h1>
        <p className="muted" style={{ maxWidth: '70ch' }}>
          {lead}
        </p>
      </div>

      {!answers || !decision ? (
        <Interview key={round} questions={questions} onComplete={finish} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
            <div className="grid gap-3">
              <Verdict ok={decision.ok} title={decision.title}>
                {decision.message}
              </Verdict>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setAnswers(null)
                    setRound((r) => r + 1)
                  }}
                >
                  Новая заявка
                </button>
                <button type="button" className="btn" onClick={() => openAssistant(`Объясни решение по услуге «${title}»: ${decision.title}. Что можно сделать, чтобы результат был лучше?`)}>
                  Спросить консультанта
                </button>
              </div>
            </div>
            <div className="card p-4 grid gap-2">
              <p className="eyebrow">Ваши ответы</p>
              <AnswersSummary questions={questions} answers={answers} />
            </div>
          </div>

          <div className="report-head">
            <div className="grid gap-1">
              <p className="eyebrow">Отчёт системы</p>
              <h2>Как было принято решение</h2>
            </div>
            <span className="tag">ваш случай — строка m{decision.row} в таблице истинности</span>
          </div>
          <div className="legend">
            {Object.entries(decision.bits).map(([k, v]) => (
              <div key={k}>
                <b>{k}</b>
                <span>
                  {labels[k]}: <b style={{ display: 'inline', width: 'auto', height: 'auto', background: 'none', color: v ? 'var(--ok)' : 'var(--miss)' }}>{v ? 'да (1)' : 'нет (0)'}</b>
                </span>
              </div>
            ))}
          </div>
          {report(decision, answers)}
        </>
      )}
      {extra}
    </div>
  )
}

function Task(props: { title: string; children: ReactNode }) {
  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-display font-bold">{props.title}</summary>
      <div className="grid gap-2 muted mt-3">{props.children}</div>
    </details>
  )
}

const yesNo = (v: Answer) => (v ? 1 : 0)

// ================================================================ задача 1
const Q1: InterviewQuestion[] = [
  { key: 'A', kind: 'yesno', text: 'У вас высокий кредитный рейтинг?', hint: 'Рейтинг можно бесплатно узнать в бюро кредитных историй через Госуслуги.' },
  { key: 'B', kind: 'yesno', text: 'Вы можете подтвердить доход официальной справкой?', hint: 'Например, справкой о доходах или выпиской из Социального фонда.' },
  { key: 'C', kind: 'yesno', text: 'Есть ли у вас поручитель с хорошей кредитной историей?' },
]

function ProcessLog({ rows }: { rows: ReturnType<typeof task1CheckLog>['rows'] }) {
  return (
    <div className="scroll-x">
      <table className="tt">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>A</th>
            <th>B</th>
            <th>C</th>
            <th>По правилу</th>
            <th>Решение</th>
            <th>Кто</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.case}>
              <td>{r.case}</td>
              <td>{r.A}</td>
              <td>{r.B}</td>
              <td>{r.C}</td>
              <td className="is-res">{r.expected}</td>
              <td>{r.decision === 'approved' ? 'одобрено' : 'отказ'}</td>
              <td style={{ fontFamily: 'var(--f-body)' }}>{r.actor}</td>
              <td>
                {r.status === 'ok' ? <span className="tag tag--ok">норма</span> : r.status === 'violation' ? <span className="tag tag--miss">нарушение</span> : <span className="tag tag--gold">упущено</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProcessMining() {
  const [log, setLog] = useState<LogRow[]>(TASK1_EVENT_LOG)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const res = useMemo(() => task1CheckLog(log), [log])
  const load = async (f: File) => {
    try {
      const rows = parseLogCsv(await f.text())
      if (!rows.length) throw new Error('В файле нет строк')
      setLog(rows)
      setError(null)
      saveResult({ task: 'task1', mode: 'process_mining', input: { rows: rows.length }, result: { violations: task1CheckLog(rows).violations } })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="grid gap-4">
      <div className="card p-5 grid gap-3">
        <p className="muted">
          Process Mining сверяет журнал событий с правилом <span className="font-mono">F = A∧(B∨C)</span>. Одобрено вопреки правилу — <b>нарушение</b> (риск для банка). Отказано, хотя правило разрешало, — <b>упущенная выгода</b>.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Загрузить свой журнал (CSV)
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setLog(TASK1_EVENT_LOG)}>
            Демо-журнал
          </button>
          <span className="text-sm muted font-mono">case;A;B;C;approved|rejected;actor</span>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </div>
        {error ? <p className="auth__error">{error}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="eyebrow">Соответствие правилу</p>
          <p className="font-display text-3xl font-bold">{Math.round(res.conformance * 100)}%</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Нарушения</p>
          <p className="font-display text-3xl font-bold" style={{ color: 'var(--miss)' }}>
            {res.violations.length}
          </p>
          <p className="text-sm muted font-mono">{res.violations.join(', ') || '—'}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Упущенные заявки</p>
          <p className="font-display text-3xl font-bold" style={{ color: 'var(--gold)' }}>
            {res.missed.length}
          </p>
          <p className="text-sm muted font-mono">{res.missed.join(', ') || '—'}</p>
        </div>
      </div>
      <div className="card p-4">
        <ProcessLog rows={res.rows} />
      </div>
    </div>
  )
}

function ClientsTable({ clients }: { clients: Client[] }) {
  const rows = clients.map(task2Classify)
  return (
    <div className="scroll-x">
      <table className="tt">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Клиент</th>
            <th>Покупки</th>
            <th>Чек, ₽</th>
            <th>Лояльн.</th>
            <th>ЧС</th>
            <th>A B C D</th>
            <th>F</th>
            <th>без скобок</th>
            <th style={{ textAlign: 'left' }}>Почему</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name + i} className={r.premium ? 'is-hl' : undefined}>
              <td style={{ textAlign: 'left', fontFamily: 'var(--f-body)' }}>{r.name}</td>
              <td>{r.purchases}</td>
              <td>{r.avg_check.toLocaleString('ru-RU')}</td>
              <td>{r.loyalty ? 'да' : 'нет'}</td>
              <td>{r.blacklist ? 'да' : 'нет'}</td>
              <td>
                {r.A} {r.B} {r.C} {r.D}
              </td>
              <td className="is-res">{r.premium ? <span className="tag tag--ok">премиум</span> : <span className="tag">нет</span>}</td>
              <td className={r.withoutBrackets !== r.premium ? 'is-diff' : ''}>{r.withoutBrackets}</td>
              <td style={{ textAlign: 'left', fontFamily: 'var(--f-body)', minWidth: 220 }}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClientLab() {
  const [clients, setClients] = useState<Client[]>(TASK2_CLIENTS)
  const [draft, setDraft] = useState<Client>({ name: '', purchases: 11, avg_check: 4000, loyalty: true, blacklist: false })
  const add = () => {
    const c = { ...draft, name: draft.name.trim() || `Клиент ${clients.length + 1}` }
    setClients([...clients, c])
    const r = task2Classify(c)
    saveResult({ task: 'task2', mode: 'check', input: { ...c }, result: { premium: r.premium } })
    setDraft({ ...draft, name: '' })
  }
  return (
    <div className="grid gap-4">
      <div className="card p-5 grid gap-3">
        <p className="muted">Добавьте своих клиентов — система разметит их правилом F = A∧(B∨C)∧¬D и покажет, что дала бы ошибочная формула без скобок.</p>
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto_auto_auto] items-end">
          <label className="grid gap-1 text-sm">
            Имя
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Мария" />
          </label>
          <label className="grid gap-1 text-sm">
            Покупок
            <input className="input" type="number" min={0} value={draft.purchases} onChange={(e) => setDraft({ ...draft, purchases: Math.max(0, +e.target.value) })} />
          </label>
          <label className="grid gap-1 text-sm">
            Средний чек, ₽
            <input className="input" type="number" min={0} step={100} value={draft.avg_check} onChange={(e) => setDraft({ ...draft, avg_check: Math.max(0, +e.target.value) })} />
          </label>
          <label className="flex gap-2 items-center text-sm pb-2">
            <input type="checkbox" checked={draft.loyalty} onChange={(e) => setDraft({ ...draft, loyalty: e.target.checked })} /> лояльность
          </label>
          <label className="flex gap-2 items-center text-sm pb-2">
            <input type="checkbox" checked={!!draft.blacklist} onChange={(e) => setDraft({ ...draft, blacklist: e.target.checked })} /> чёрный список
          </label>
          <button type="button" className="btn btn--primary" onClick={add}>
            Добавить
          </button>
        </div>
      </div>
      <div className="card p-4">
        <ClientsTable clients={clients} />
      </div>
    </div>
  )
}

function CompareVariants() {
  const a = solveTask3('strict')
  const b = solveTask3('deposit')
  const rows = [0, 1, 2, 3, 4, 5, 6, 7]
  return (
    <div className="grid gap-4">
      <div className="card p-4 scroll-x">
        <table className="tt">
          <thead>
            <tr>
              <th>Набор</th>
              <th>X Y Z</th>
              <th>Вариант 1</th>
              <th>Вариант 2</th>
              <th style={{ textAlign: 'left' }}>Клиент</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const x = (m >> 2) & 1
              const y = (m >> 1) & 1
              const z = m & 1
              const f1 = +a.minterms.includes(m)
              const f2 = +b.minterms.includes(m)
              return (
                <tr key={m}>
                  <td>m{m}</td>
                  <td>
                    {x} {y} {z}
                  </td>
                  <td className="is-res">{f1}</td>
                  <td className={`is-res ${f1 !== f2 ? 'is-diff' : ''}`}>{f2}</td>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--f-body)' }}>
                    {x ? 'высокий доход' : 'доход обычный'}, {y ? 'история хорошая' : 'история плохая'}, {z ? 'есть депозит' : 'без депозита'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[a, b].map((s, i) => (
          <div key={i} className="card p-5 grid gap-2">
            <p className="eyebrow">{i ? TASK3_VARIANTS.deposit.title : TASK3_VARIANTS.strict.title}</p>
            <div className="formula">F = {s.qm.minimal_dnf}</div>
            <p className="text-sm muted">Минтермы: {s.minterms.map((m) => 'm' + m).join(', ')}</p>
          </div>
        ))}
      </div>
      <p className="muted">
        Варианты расходятся только на наборе <b>m1</b> (без высокого дохода, плохая история, есть депозит): во втором прочтении такого клиента одобряем «даже если кредитная история подкачала». Перед внедрением это стоит согласовать с риск-менеджерами.
      </p>
    </div>
  )
}

export function Task1() {
  const steps = useMemo(solveTask1, [])
  const log = useMemo(() => task1CheckLog(), [])
  const block = (s: Step) => (s.block === 'processLog' ? <ProcessLog rows={log.rows} /> : null)
  return (
    <ServicePage
      id="task1"
      labels={{ A: 'Высокий кредитный рейтинг', B: 'Доход подтверждён', C: 'Есть поручитель' }}
      num={1}
      title="Кредитная заявка"
      lead="Ответьте на три вопроса — система «Навигатор BI» сразу примет решение по заявке на кредит."
      questions={Q1}
      decide={(a) => {
        const [A, B, C] = [yesNo(a.A), yesNo(a.B), yesNo(a.C)]
        const d = task1Decide(A, B, C)
        return {
          ok: d.approved,
          title: d.approved ? 'Кредит одобрен' : 'В кредите отказано',
          message: (
            <>
              <p>{d.reason}</p>
              {!d.approved && A ? <p className="text-sm muted">Принесите справку о доходах или найдите поручителя — тогда заявка будет одобрена.</p> : null}
              {!A ? <p className="text-sm muted">Без высокого кредитного рейтинга автоматическое одобрение невозможно: заявку может рассмотреть сотрудник банка.</p> : null}
            </>
          ),
          row: A * 4 + B * 2 + C,
          bits: { A, B, C },
          result: { formula: 'A∧(B∨C)' },
        }
      }}
      report={(d) => (
        <>
          <Task title="Бизнес-правило банка">
            <p>A — кредитный рейтинг высокий, B — доход подтверждён официальной справкой, C — есть поручитель с хорошей историей.</p>
            <p>«Заявка одобряется, если у клиента высокий рейтинг И подтверждён доход, ЛИБО если рейтинг высокий, доход не подтверждён, но есть надёжный поручитель».</p>
          </Task>
          <StepList steps={steps} renderBlock={block} highlightRow={d.row} />
        </>
      )}
      extra={
        <details className="card p-5">
          <summary className="cursor-pointer font-display font-bold">Для сотрудников: проверка журнала заявок (Process Mining)</summary>
          <div className="mt-4">
            <ProcessMining />
          </div>
        </details>
      }
    />
  )
}

// ================================================================ задача 2
const Q2: InterviewQuestion[] = [
  { key: 'purchases', kind: 'number', text: 'Сколько покупок вы совершили в нашем магазине?', placeholder: '12', format: (v) => `${v}` },
  { key: 'avg_check', kind: 'number', text: 'Какой у вас средний чек?', unit: '₽', placeholder: '6000' },
  { key: 'loyalty', kind: 'yesno', text: 'Вы участвуете в программе лояльности?' },
  { key: 'blacklist', kind: 'yesno', text: 'Ваш аккаунт заблокирован за нарушение правил магазина?', hint: 'Такие клиенты находятся в «чёрном списке».' },
]

export function Task2() {
  const steps = useMemo(solveTask2, [])
  return (
    <ServicePage
      id="task2"
      labels={{ A: 'Больше 10 покупок', B: 'Средний чек > 5000 ₽', C: 'Программа лояльности', D: 'Чёрный список' }}
      num={2}
      title="Закрытая распродажа «Премиум»"
      lead="Ответьте на четыре вопроса — система проверит, входите ли вы в сегмент премиум-клиентов и получите ли доступ к закрытой распродаже."
      questions={Q2}
      decide={(a) => {
        const client: Client = { name: 'Вы', purchases: Number(a.purchases), avg_check: Number(a.avg_check), loyalty: !!a.loyalty, blacklist: !!a.blacklist }
        const r = task2Classify(client)
        return {
          ok: !!r.premium,
          title: r.premium ? 'Вы — премиум-клиент' : 'Пока не премиум',
          message: (
            <>
              <p>{r.premium ? 'Доступ к закрытой распродаже открыт: ' : 'Причина: '}{r.reason}.</p>
              {!r.premium && !r.D && !r.A ? <p className="text-sm muted">Совершите больше 10 покупок — и при высоком чеке или участии в программе лояльности вы попадёте в сегмент.</p> : null}
              {!r.premium && !r.D && r.A ? <p className="text-sm muted">Вступите в программу лояльности — это бесплатно и сразу откроет доступ.</p> : null}
            </>
          ),
          row: r.A * 8 + r.B * 4 + r.C * 2 + r.D,
          bits: { A: r.A, B: r.B, C: r.C, D: r.D },
          result: { premium: r.premium },
        }
      }}
      report={(d, a) => {
        const me: Client = { name: 'Вы', purchases: Number(a.purchases), avg_check: Number(a.avg_check), loyalty: !!a.loyalty, blacklist: !!a.blacklist }
        return (
          <>
            <Task title="Бизнес-правило сегмента">
              <p>A — больше 10 покупок, B — средний чек выше 5000 ₽, C — участие в программе лояльности, D — клиент в чёрном списке.</p>
              <p>«Клиент премиальный, если совершил более 10 покупок И его средний чек выше 5000 ₽ ИЛИ он участвует в программе лояльности. Клиент из чёрного списка в сегмент не попадает ни при каких условиях».</p>
            </Task>
            <StepList steps={steps} highlightRow={d.row} renderBlock={(s) => (s.block === 'clients' ? <ClientsTable clients={[me, ...TASK2_CLIENTS]} /> : null)} />
          </>
        )
      }}
      extra={
        <details className="card p-5">
          <summary className="cursor-pointer font-display font-bold">Для маркетологов: разметка списка клиентов</summary>
          <div className="mt-4">
            <ClientLab />
          </div>
        </details>
      }
    />
  )
}

// ================================================================ задача 3
const Q3: InterviewQuestion[] = [
  { key: 'X', kind: 'yesno', text: 'У вас высокий доход?' },
  { key: 'Y', kind: 'yesno', text: 'У вас положительная кредитная история?', hint: 'Нет просрочек и действующих долгов.' },
  { key: 'Z', kind: 'yesno', text: 'Есть ли у вас депозит в нашем банке?' },
]

function Task3Report({ row }: { row: number }) {
  const [variant, setVariant] = useState<Variant>('strict')
  const sol = useMemo(() => solveTask3(variant), [variant])
  const block = (s: Step) => (s.block === 'qmStages' ? <QMStages qm={sol.qm} /> : s.block === 'qmChart' ? <QMChart qm={sol.qm} /> : null)
  return (
    <>
      <Task title="Бизнес-правила выдачи карты">
        <p>X — высокий доход, Y — положительная кредитная история, Z — депозит в банке.</p>
        <p>Одобряем, если: 1) высокий доход И положительная кредитная история (депозит не важен); 2) нет высокого дохода, но есть идеальная кредитная история И крупный депозит, «даже если кредитная история подкачала».</p>
        <p>Второе правило сформулировано противоречиво, поэтому отчёт построен для двух прочтений.</p>
      </Task>
      <div className="seg" role="group" aria-label="Прочтение правила 2">
        {(Object.keys(TASK3_VARIANTS) as Variant[]).map((v) => (
          <button key={v} type="button" aria-pressed={variant === v} onClick={() => setVariant(v)}>
            {TASK3_VARIANTS[v].title}
          </button>
        ))}
      </div>
      <StepList key={variant} steps={sol.steps} renderBlock={block} highlightRow={row} />
      <details className="card p-5">
        <summary className="cursor-pointer font-display font-bold">Сравнение двух прочтений правила</summary>
        <div className="mt-4">
          <CompareVariants />
        </div>
      </details>
    </>
  )
}

export function Task3() {
  return (
    <ServicePage
      id="task3"
      labels={{ X: 'Высокий доход', Y: 'Положительная история', Z: 'Депозит в банке' }}
      num={3}
      title="Премиальная кредитная карта"
      lead="Ответьте на три вопроса — микросервис банка сразу решит, можно ли выдать вам премиальную кредитную карту."
      questions={Q3}
      decide={(a) => {
        const [X, Y, Z] = [yesNo(a.X), yesNo(a.Y), yesNo(a.Z)]
        const main = task3Decide('strict', X, Y, Z)
        const soft = task3Decide('deposit', X, Y, Z)
        return {
          ok: main.approved,
          title: main.approved ? 'Карта одобрена' : 'В выдаче карты отказано',
          message: (
            <>
              <p>{main.reason}</p>
              {soft.approved !== main.approved ? (
                <p className="text-sm muted">При мягком прочтении правила 2 (депозит без учёта кредитной истории) решение было бы положительным — заявку стоит передать риск-менеджеру.</p>
              ) : null}
            </>
          ),
          row: main.minterm,
          bits: { X, Y, Z },
          result: { minterm: main.minterm, soft: soft.approved },
        }
      }}
      report={(d) => <Task3Report row={d.row} />}
    />
  )
}
