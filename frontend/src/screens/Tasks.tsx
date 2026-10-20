import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { openAssistant } from '../components/Assistant'
import { Legend, QMChart, QMStages, StepByStep } from '../components/Solution'
import { Checker, Wizard } from '../components/Wizard'
import { saveResult } from '../lib/store'
import {
  solveTask1,
  solveTask2,
  solveTask3,
  task1CheckLog,
  task1Decide,
  task2Classify,
  task3Decide,
  task3Questions,
  parseLogCsv,
  TASK1_EVENT_LOG,
  TASK1_QUESTIONS,
  TASK1_VARS,
  TASK2_CLIENTS,
  TASK2_QUESTIONS,
  TASK2_VARS,
  TASK3_VARIANTS,
  TASK3_VARS,
} from '../logic/tasks'
import type { Client, LogRow, Step, TaskId, Variant } from '../logic/tasks'

type Tab = 'solution' | 'wizard' | 'check' | 'extra'

function TaskShell({
  id,
  num,
  title,
  condition,
  vars,
  tabs,
  extraLabel,
  top,
}: {
  id: TaskId
  num: number
  title: string
  condition: ReactNode
  vars: { key: string; label: string }[]
  tabs: Record<Tab, ReactNode | null>
  extraLabel?: string
  top?: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('solution')
  const labels: [Tab, string][] = [
    ['solution', 'Пошаговое решение'],
    ['wizard', 'Наводящие вопросы'],
    ['check', 'Проверить клиента'],
  ]
  if (tabs.extra && extraLabel) labels.push(['extra', extraLabel])
  return (
    <div className="wrap page">
      <div className="page__head">
        <p className="eyebrow">Окно {num} · задача {num}</p>
        <h1>{title}</h1>
      </div>
      <div className="card p-5 grid gap-3">
        <p className="eyebrow">Условие</p>
        <div className="grid gap-2 muted">{condition}</div>
        <div>
          <button type="button" className="auth__link" onClick={() => openAssistant(`Объясни простыми словами задачу ${num}: «${title}»`)}>
            Не понятно условие? Спросить консультанта
          </button>
        </div>
      </div>
      <Legend vars={vars} />
      {top}
      <div className="seg" role="tablist" aria-label="Режим">
        {labels.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div key={tab + id}>{tabs[tab]}</div>
    </div>
  )
}

function Answer({ title = 'Ответ', children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card answer" aria-label="Ответ">
      <p className="eyebrow" style={{ color: 'var(--accent)' }}>
        Итог
      </p>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

// ================================================================ задача 1
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

export function Task1() {
  const steps = useMemo(solveTask1, [])
  const log = useMemo(() => task1CheckLog(), [])
  const answer = (
    <Answer title="F = A ∧ (B ∨ C)">
      <p>Заявка одобряется, если у клиента высокий кредитный рейтинг и при этом либо подтверждён доход, либо есть надёжный поручитель.</p>
      <div className="formula">(A∧B) ∨ (A∧¬B∧C) = A∧(B∨C)</div>
      <p className="muted">
        В «Навигатор BI» вместо трёх сложных проверок — две. Process Mining в демо-журнале нашёл нарушения: <b>{log.violations.join(', ')}</b>, упущенные заявки: <b>{log.missed.join(', ')}</b>.
      </p>
    </Answer>
  )
  const block = (s: Step) => (s.block === 'processLog' ? <ProcessLog rows={log.rows} /> : null)
  return (
    <TaskShell
      id="task1"
      num={1}
      title="Автоодобрение кредитной заявки"
      vars={TASK1_VARS}
      condition={
        <>
          <p>В системе «Навигатор BI» проектируется модуль автоматического одобрения кредитной заявки. Решение зависит от трёх условий A, B, C.</p>
          <p>
            Бизнес-правило: «Заявка одобряется, если у клиента высокий рейтинг <b>И</b> подтверждён доход, <b>ЛИБО</b> если у клиента высокий рейтинг, но не подтверждён доход официальной справкой, но при этом есть надёжный поручитель».
          </p>
          <p>Нужно: 1) составить логическую функцию F(A,B,C); 2) минимизировать её законами алгебры логики; 3) проверить с помощью Process Mining, выполняется ли правило в реальных процессах (поиск нарушений).</p>
        </>
      }
      extraLabel="Process Mining"
      tabs={{
        solution: <StepByStep steps={steps} renderBlock={block} answer={answer} onFinish={() => saveResult({ task: 'task1', mode: 'solution', result: { minimal: 'A∧(B∨C)' } })} />,
        wizard: <Wizard questions={TASK1_QUESTIONS} final={answer} onDone={(score, total) => saveResult({ task: 'task1', mode: 'wizard', score, total })} />,
        check: (
          <Checker
            vars={TASK1_VARS}
            formula="F = A∧(B∨C)"
            decide={([a, b, c]) => ({ ...task1Decide(a, b, c), minterm: a * 4 + b * 2 + c })}
            onCheck={(bits, approved) => saveResult({ task: 'task1', mode: 'check', input: { A: bits[0], B: bits[1], C: bits[2] }, result: { approved } })}
          />
        ),
        extra: <ProcessMining />,
      }}
    />
  )
}

// ================================================================ задача 2
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

export function Task2() {
  const steps = useMemo(solveTask2, [])
  const answer = (
    <Answer title="F = A ∧ (B ∨ C) ∧ ¬D">
      <p>
        В сегмент «Премиум» попадают <b>Анна, Игорь и Елена</b>. Олег — нет: у него всего 5 покупок.
      </p>
      <p className="muted">Главная фишка задачи — правильно расставить приоритеты (скобки). Без скобок условие «больше 10 покупок» относилось бы только к среднему чеку, и все участники программы лояльности (даже с одной покупкой) попали бы в премиум. Благодаря скобкам сегмент выделен абсолютно корректно.</p>
      <div className="formula">¬(B∨C) = ¬B∧¬C → avg_check &lt;= 5000 AND loyalty = FALSE</div>
    </Answer>
  )
  const block = (s: Step) => (s.block === 'clients' ? <ClientsTable clients={TASK2_CLIENTS} /> : null)
  return (
    <TaskShell
      id="task2"
      num={2}
      title="Сегмент «Премиум» для закрытой распродажи"
      vars={TASK2_VARS}
      condition={
        <>
          <p>Вы — BI-аналитик в интернет-магазине. Маркетологи хотят выделить сегмент «Премиум-клиентов» для закрытой распродажи.</p>
          <p>
            Бизнес-правило: клиент считается премиальным, если он совершил более 10 покупок <b>И</b> его средний чек выше 5000 ₽ <b>ИЛИ</b> он участвует в программе лояльности. Однако если клиент находится в чёрном списке, он ни при каких условиях не должен попасть в этот сегмент.
          </p>
        </>
      }
      extraLabel="Свои клиенты"
      tabs={{
        solution: <StepByStep steps={steps} renderBlock={block} answer={answer} onFinish={() => saveResult({ task: 'task2', mode: 'solution', result: { premium: ['Анна', 'Игорь', 'Елена'] } })} />,
        wizard: <Wizard questions={TASK2_QUESTIONS} final={answer} onDone={(score, total) => saveResult({ task: 'task2', mode: 'wizard', score, total })} />,
        check: (
          <Checker
            vars={TASK2_VARS}
            formula="F = A∧(B∨C)∧¬D"
            decide={([a, b, c, d]) => {
              const r = task2Classify({ name: '', purchases: a ? 11 : 0, avg_check: b ? 5001 : 0, loyalty: !!c, blacklist: !!d })
              return { approved: !!r.premium, reason: (r.premium ? 'Клиент попадает в «Премиум»: ' : 'Не попадает: ') + r.reason, minterm: a * 8 + b * 4 + c * 2 + d }
            }}
            onCheck={(bits, approved) => saveResult({ task: 'task2', mode: 'check', input: { A: bits[0], B: bits[1], C: bits[2], D: bits[3] }, result: { premium: approved } })}
          />
        ),
        extra: <ClientLab />,
      }}
    />
  )
}

// ================================================================ задача 3
export function Task3() {
  const [variant, setVariant] = useState<Variant>('strict')
  const sol = useMemo(() => solveTask3(variant), [variant])
  const questions = useMemo(() => task3Questions(variant), [variant])
  const block = (s: Step) => (s.block === 'qmStages' ? <QMStages qm={sol.qm} /> : s.block === 'qmChart' ? <QMChart qm={sol.qm} /> : null)
  const answer = (
    <Answer title={`F = ${sol.qm.minimal_dnf}`}>
      <div className="grid gap-2">
        <p className="eyebrow">СДНФ</p>
        <div className="formula">{sol.qm.sdnf}</div>
        <p className="eyebrow">СКНФ</p>
        <div className="formula">{sol.qm.sknf}</div>
      </div>
      <p className="muted">
        Простые импликанты: {sol.qm.prime_implicants.map((p) => p.term).join(', ')}. Существенные: {sol.qm.essential.map((p) => p.term).join(', ')}.
        {sol.qm.redundant.length ? ` Лишняя: ${sol.qm.redundant.map((p) => p.term).join(', ')}.` : ' Лишних нет.'}
      </p>
      <p>{variant === 'strict' ? 'Без положительной кредитной истории — отказ; с ней достаточно высокого дохода или депозита: F = Y∧(X∨Z).' : 'При высоком доходе решает кредитная история, без него — наличие депозита (мультиплексор по X).'}</p>
    </Answer>
  )
  return (
    <TaskShell
      id="task3"
      num={3}
      title="Автоматизация одобрения кредитного лимита"
      vars={TASK3_VARS}
      condition={
        <>
          <p>Финтех-компания разрабатывает микросервис для автоматизации решения по выдаче премиальных кредитных карт. Система анализирует три фактора: X — высокий доход, Y — положительная кредитная история, Z — наличие депозита в банке.</p>
          <p>Положительное решение выдаётся только если: 1) высокий доход И положительная кредитная история (депозит не важен); 2) у клиента нет высокого дохода, но есть идеальная кредитная история И крупный депозит, «даже если кредитная история подкачала».</p>
          <p>Задача: построить таблицу Квайна, найти СДНФ и СКНФ, бизнес-интерпретировать процесс и результаты для IT-отдела.</p>
          <p className="law">Второе правило противоречиво («идеальная история» и «даже если история подкачала»), поэтому задача решена в двух прочтениях — переключайте вариант ниже.</p>
        </>
      }
      top={
        <div className="grid gap-2">
          <p className="eyebrow">Прочтение правила 2</p>
          <div className="seg" role="group" aria-label="Вариант">
            {(Object.keys(TASK3_VARIANTS) as Variant[]).map((v) => (
              <button key={v} type="button" aria-pressed={variant === v} onClick={() => setVariant(v)}>
                {TASK3_VARIANTS[v].title}
              </button>
            ))}
          </div>
        </div>
      }
      extraLabel="Сравнить варианты"
      tabs={{
        solution: <StepByStep key={variant} steps={sol.steps} renderBlock={block} answer={answer} onFinish={() => saveResult({ task: 'task3', mode: 'solution', variant, result: { minimal: sol.qm.minimal_dnf } })} />,
        wizard: <Wizard key={variant} questions={questions} final={answer} onDone={(score, total) => saveResult({ task: 'task3', mode: 'wizard', variant, score, total })} />,
        check: (
          <Checker
            key={variant}
            vars={TASK3_VARS}
            formula={`F = ${sol.qm.minimal_dnf}`}
            decide={([x, y, z]) => task3Decide(variant, x, y, z)}
            onCheck={(bits, approved) => saveResult({ task: 'task3', mode: 'check', variant, input: { X: bits[0], Y: bits[1], Z: bits[2] }, result: { approved } })}
          />
        ),
        extra: <CompareVariants />,
      }}
    />
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
