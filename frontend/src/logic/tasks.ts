/**
 * Три задачи банка: данные, решения по шагам, наводящие вопросы.
 * Логика совпадает с backend/app/logic/tasks.py (сверено вручную тестами backend/tests/test_logic.py).
 */
import { AND, NOT, OR, quineMcCluskey, tableRows } from './boolean'
import type { QMResult, Table } from './boolean'

export type TaskId = 'task1' | 'task2' | 'task3'
export type Variant = 'strict' | 'deposit'

export interface Step {
  title: string
  text?: string
  formula?: string
  law?: string
  table?: Table & { highlight?: number[]; resultCols?: number }
  code?: string
  block?: 'qmStages' | 'qmChart' | 'processLog' | 'clients'
}

export interface Question {
  q: string
  options: string[]
  correct: number
  explain: string
  hint?: string
}

export interface VarInfo {
  key: string
  label: string
  /** вопрос, который задаём пользователю при проверке клиента */
  ask: string
}

// =========================================================== задача 1
export const TASK1_VARS: VarInfo[] = [
  { key: 'A', label: 'Кредитный рейтинг клиента высокий', ask: 'У клиента высокий кредитный рейтинг?' },
  { key: 'B', label: 'Доход подтверждён официальной справкой', ask: 'Доход подтверждён официальной справкой?' },
  { key: 'C', label: 'Есть поручитель с хорошей кредитной историей', ask: 'Есть поручитель с хорошей историей?' },
]

export const task1Original = (a: number, b: number, c: number) => +((a && b) || (a && !b && c))
export const task1Minimal = (a: number, b: number, c: number) => +(a && (b || c))

export interface LogRow {
  case: string
  A: number
  B: number
  C: number
  decision: 'approved' | 'rejected'
  actor?: string
}

export const TASK1_EVENT_LOG: LogRow[] = [
  { case: 'Z-1001', A: 1, B: 1, C: 0, decision: 'approved', actor: 'робот' },
  { case: 'Z-1002', A: 1, B: 0, C: 1, decision: 'approved', actor: 'робот' },
  { case: 'Z-1003', A: 0, B: 1, C: 1, decision: 'approved', actor: 'менеджер Петров' },
  { case: 'Z-1004', A: 1, B: 0, C: 0, decision: 'rejected', actor: 'робот' },
  { case: 'Z-1005', A: 0, B: 0, C: 1, decision: 'rejected', actor: 'робот' },
  { case: 'Z-1006', A: 1, B: 0, C: 0, decision: 'approved', actor: 'менеджер Сидорова' },
  { case: 'Z-1007', A: 1, B: 1, C: 1, decision: 'approved', actor: 'робот' },
  { case: 'Z-1008', A: 0, B: 1, C: 0, decision: 'rejected', actor: 'робот' },
  { case: 'Z-1009', A: 1, B: 0, C: 1, decision: 'rejected', actor: 'менеджер Петров' },
  { case: 'Z-1010', A: 0, B: 0, C: 0, decision: 'approved', actor: 'менеджер Сидорова' },
  { case: 'Z-1011', A: 1, B: 1, C: 0, decision: 'approved', actor: 'робот' },
  { case: 'Z-1012', A: 0, B: 1, C: 1, decision: 'rejected', actor: 'робот' },
]

export type LogStatus = 'ok' | 'violation' | 'missed'
export interface CheckedRow extends LogRow {
  expected: number
  actual: number
  status: LogStatus
}

export function task1CheckLog(log: LogRow[] = TASK1_EVENT_LOG) {
  const rows: CheckedRow[] = log.map((r) => {
    const expected = task1Minimal(r.A, r.B, r.C)
    const actual = r.decision === 'approved' ? 1 : 0
    const status: LogStatus = actual && !expected ? 'violation' : !actual && expected ? 'missed' : 'ok'
    return { ...r, expected, actual, status }
  })
  return {
    rows,
    violations: rows.filter((r) => r.status === 'violation').map((r) => r.case),
    missed: rows.filter((r) => r.status === 'missed').map((r) => r.case),
    conformance: rows.length ? rows.filter((r) => r.status === 'ok').length / rows.length : 1,
  }
}

/** Разбор CSV журнала: case;A;B;C;decision[;actor]. decision — approved/rejected или одобрено/отказ. */
export function parseLogCsv(text: string): LogRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows: LogRow[] = []
  for (const [i, line] of lines.entries()) {
    const cells = line.split(/[;,\t]/).map((c) => c.trim())
    if (i === 0 && !/^\d|^[01]$/.test(cells[1] ?? '')) continue // заголовок
    if (cells.length < 5) throw new Error(`Строка ${i + 1}: нужно минимум 5 столбцов`)
    const bit = (v: string) => (/^(1|да|true|yes)$/i.test(v) ? 1 : 0)
    const dec = /^(approved|одобрен|одобрено|1|да)$/i.test(cells[4]) ? 'approved' : 'rejected'
    rows.push({ case: cells[0], A: bit(cells[1]), B: bit(cells[2]), C: bit(cells[3]), decision: dec, actor: cells[5] })
  }
  return rows
}

export function task1Decide(a: number, b: number, c: number) {
  const approved = !!task1Minimal(a, b, c)
  const reason = !a
    ? 'Кредитный рейтинг не высокий — автоматически не одобряем (A = 0).'
    : approved
      ? `Высокий рейтинг и ${b ? 'подтверждённый доход' : 'надёжный поручитель'}.`
      : 'Рейтинг высокий, но нет ни подтверждённого дохода, ни поручителя.'
  return { approved, reason }
}

export function solveTask1(): Step[] {
  const table = tableRows(['A', 'B', 'C'], {
    'A∧B': (a, b) => a && b,
    'A∧¬B∧C': (a, b, c) => a && !b && c,
    'F исходная': task1Original,
    'A∧(B∨C)': task1Minimal,
  })
  const log = task1CheckLog()
  return [
    {
      title: 'Формализация условий',
      text: '«Высокий рейтинг И подтверждён доход» → A∧B. «Высокий рейтинг, но доход НЕ подтверждён, И есть поручитель» → A∧¬B∧C. Два случая связаны союзом «ЛИБО» — это дизъюнкция ∨.',
      formula: 'F(A,B,C) = (A∧B) ∨ (A∧¬B∧C)',
    },
    {
      title: 'Выносим A за скобку',
      law: 'Дистрибутивный закон: (X∧Y) ∨ (X∧Z) = X∧(Y∨Z)',
      text: 'Общий множитель A входит в оба слагаемых.',
      formula: 'F = A ∧ (B ∨ (¬B∧C))',
    },
    {
      title: 'Раскрываем внутреннюю скобку',
      law: 'Распределительный закон дизъюнкции относительно конъюнкции: X ∨ (Y∧Z) = (X∨Y) ∧ (X∨Z)',
      text: 'B ∨ (¬B∧C) = (B∨¬B) ∧ (B∨C).',
      formula: 'F = A ∧ ((B∨¬B) ∧ (B∨C))',
    },
    {
      title: 'Убираем тождественную истину',
      law: 'Закон исключённого третьего: X ∨ ¬X = 1; свойство единицы: 1 ∧ X = X',
      text: 'B ∨ ¬B = 1, поэтому скобка (B∨¬B) исчезает.',
      formula: 'F = A ∧ (B ∨ C)',
    },
    {
      title: 'Проверка таблицей истинности',
      text: 'Столбцы исходной и минимальной формулы совпадают на всех 8 наборах — упрощение верное.',
      table: { ...table, resultCols: 2 },
    },
    {
      title: 'Реализация в «Навигатор BI»',
      text: 'В конструктор бизнес-логики закладывается правило F = A∧(B∨C). Вместо трёх сложных проверок (одна из них с отрицанием) система делает две — это снижает требования к вычислительным ресурсам.',
      code: 'approve = rating_high AND (income_confirmed OR has_guarantor)',
    },
    {
      title: 'Process Mining: поиск нарушений',
      text: `Сверили ${log.rows.length} заявок журнала с правилом. Одобрено вопреки правилу: ${log.violations.join(', ') || 'нет'}. Отклонено, хотя правило разрешало: ${log.missed.join(', ') || 'нет'}. Соответствие процесса правилу: ${Math.round(log.conformance * 100)}%.`,
      block: 'processLog',
    },
  ]
}

export const TASK1_QUESTIONS: Question[] = [
  {
    q: 'Какой логической операцией записывается союз «И» из условия?',
    options: ['Дизъюнкция ∨', 'Конъюнкция ∧', 'Импликация →', 'Отрицание ¬'],
    correct: 1,
    explain: '«И» — конъюнкция: результат истинен, только когда истинны оба высказывания.',
  },
  {
    q: 'Как формализовать второй случай: «высокий рейтинг, доход не подтверждён, но есть поручитель»?',
    options: ['A∧B∧C', 'A∨¬B∨C', 'A∧¬B∧C', '¬A∧B∧C'],
    correct: 2,
    explain: '«Не подтверждён» — отрицание ¬B, а все три условия должны выполняться одновременно.',
    hint: 'Слово «не» превращается в ¬, а «и при этом» — в ∧.',
  },
  {
    q: 'Слово «ЛИБО» между двумя случаями — это…',
    options: ['∧', '∨', '↔', '→'],
    correct: 1,
    explain: 'Достаточно выполнения хотя бы одного случая — это дизъюнкция ∨.',
  },
  {
    q: 'Какой закон позволяет вынести A за скобку в (A∧B) ∨ (A∧¬B∧C)?',
    options: ['Закон де Моргана', 'Закон поглощения', 'Дистрибутивный закон', 'Закон двойного отрицания'],
    correct: 2,
    explain: 'X∧Y ∨ X∧Z = X∧(Y∨Z) — дистрибутивность конъюнкции относительно дизъюнкции.',
  },
  {
    q: 'Чему равно B ∨ ¬B?',
    options: ['0', 'B', '1', '¬B'],
    correct: 2,
    explain: 'Закон исключённого третьего: высказывание либо истинно, либо ложно — дизъюнкция всегда 1.',
  },
  {
    q: 'Какая минимальная форма у правила?',
    options: ['A∧B∧C', 'A∧(B∨C)', 'A∨(B∧C)', '(A∨B)∧C'],
    correct: 1,
    explain: 'F = A∧(B∨C): высокий рейтинг обязателен, а дальше — доход или поручитель.',
  },
  {
    q: 'В журнале заявка с A=0, B=1, C=1 одобрена менеджером. Что покажет Process Mining?',
    options: ['Всё верно', 'Нарушение: одобрено вопреки правилу', 'Упущенная выгода', 'Ошибку в данных'],
    correct: 1,
    explain: 'F = 0∧(1∨1) = 0, а заявку одобрили — это нарушение регламента (риск для банка).',
  },
]

// =========================================================== задача 2
export const TASK2_VARS: VarInfo[] = [
  { key: 'A', label: 'Покупок больше 10', ask: 'Клиент совершил больше 10 покупок?' },
  { key: 'B', label: 'Средний чек выше 5000 ₽', ask: 'Средний чек выше 5000 ₽?' },
  { key: 'C', label: 'Участвует в программе лояльности', ask: 'Участвует в программе лояльности?' },
  { key: 'D', label: 'Клиент в чёрном списке', ask: 'Клиент в чёрном списке?' },
]

export interface Client {
  name: string
  purchases: number
  avg_check: number
  loyalty: boolean
  blacklist?: boolean
}

export const TASK2_CLIENTS: Client[] = [
  { name: 'Анна', purchases: 12, avg_check: 6000, loyalty: false },
  { name: 'Игорь', purchases: 15, avg_check: 3000, loyalty: true },
  { name: 'Олег', purchases: 5, avg_check: 10000, loyalty: true },
  { name: 'Елена', purchases: 20, avg_check: 8000, loyalty: true },
]

export const task2Rule = (a: number, b: number, c: number, d: number) => +(a && (b || c) && !d)
export const task2WrongPriority = (a: number, b: number, c: number, d: number) => +((a && b) || (c && !d))

export function task2Classify(c: Client) {
  const A = +(c.purchases > 10)
  const B = +(c.avg_check > 5000)
  const C = +!!c.loyalty
  const D = +!!c.blacklist
  const premium = task2Rule(A, B, C, D)
  const withoutBrackets = task2WrongPriority(A, B, C, D)
  const reason = D
    ? 'в чёрном списке — в сегмент не попадает ни при каких условиях'
    : !A
      ? '10 покупок и меньше — не выполнено обязательное условие A'
      : premium
        ? `больше 10 покупок и ${B ? 'высокий средний чек' : 'участвует в программе лояльности'}`
        : 'нет ни высокого чека, ни участия в программе лояльности'
  return { ...c, A, B, C, D, premium, withoutBrackets, reason }
}

export const TASK2_SQL = `SELECT * FROM clients
WHERE purchases_count > 10
  AND (avg_check > 5000 OR loyalty = TRUE)
  AND NOT is_blacklisted;`

export const TASK2_SQL_DEMORGAN = `-- ¬(B ∨ C) = ¬B ∧ ¬C (закон де Моргана)
SELECT * FROM clients
WHERE avg_check <= 5000 AND loyalty = FALSE;`

export function solveTask2(): Step[] {
  const table = tableRows(['A', 'B', 'C', 'D'], {
    'B∨C': (_a, b, c) => b || c,
    '¬D': (_a, _b, _c, d) => !d,
    F: task2Rule,
    'без скобок': task2WrongPriority,
  })
  const ones = table.rows.filter((r) => r[r.length - 2]).length
  const diff = table.rows.filter((r) => r[r.length - 1] !== r[r.length - 2]).length
  return [
    {
      title: 'Выделяем высказывания',
      text: 'A — покупок больше 10; B — средний чек выше 5000 ₽; C — участвует в программе лояльности; D — клиент в чёрном списке.',
    },
    {
      title: 'Составляем логическую функцию',
      text: '«Более 10 покупок И (чек выше 5000 ИЛИ лояльность)». «Однако чёрный список — ни при каких условиях» добавляет множитель ¬D.',
      law: 'Приоритет операций: ¬, затем ∧, затем ∨ — поэтому скобки вокруг B∨C обязательны',
      formula: 'F(A,B,C,D) = A ∧ (B ∨ C) ∧ ¬D',
    },
    {
      title: 'Таблица истинности (16 наборов)',
      text: `F = 1 ровно на ${ones} наборах. Последний столбец — та же формула без скобок: A∧B ∨ C∧¬D. Она расходится с правильной на ${diff} наборах.`,
      table: { ...table, resultCols: 2 },
    },
    {
      title: 'Законы де Моргана в аналитике',
      law: '¬(X ∨ Y) = ¬X ∧ ¬Y,   ¬(X ∧ Y) = ¬X ∨ ¬Y',
      text: 'Если маркетологи попросят выбрать тех, у кого НЕТ (высокого чека ИЛИ лояльности), аналитик-новичок напишет NOT(чек > 5000 OR лояльность = 1). Понимающий математику сразу упростит запрос: «чек ≤ 5000 AND лояльность = 0» — без OR, что снижает нагрузку на сервер и ускоряет построение дашборда.',
      formula: '¬(B ∨ C) = ¬B ∧ ¬C',
      code: TASK2_SQL_DEMORGAN,
    },
    { title: 'SQL-фильтр для BI', text: 'Правило в виде запроса к витрине клиентов.', code: TASK2_SQL },
    { title: 'Тест-кейсы на конкретных клиентах', text: 'Проверяем работу логики на реальных данных.', block: 'clients' },
  ]
}

export const TASK2_QUESTIONS: Question[] = [
  {
    q: 'Какое высказывание соответствует условию «клиент в чёрном списке не попадает в сегмент»?',
    options: ['∧D', '∨D', '∧¬D', '→D'],
    correct: 2,
    explain: 'Клиент проходит, только если он НЕ в чёрном списке: умножаем всю формулу на ¬D.',
  },
  {
    q: 'Как правильно записать «более 10 покупок И чек выше 5000 ИЛИ лояльность»?',
    options: ['A∧B∨C', 'A∧(B∨C)', '(A∧B)∨C', 'A∨B∧C'],
    correct: 1,
    explain: 'По смыслу «или» относится к чеку и лояльности, поэтому нужны скобки: A∧(B∨C).',
    hint: 'Конъюнкция выполняется раньше дизъюнкции.',
  },
  {
    q: 'Что случится, если забыть скобки и написать A∧B∨C∧¬D?',
    options: [
      'Ничего, результат тот же',
      'В премиум попадут все участники лояльности, даже с 1 покупкой',
      'Никто не попадёт в премиум',
      'Чёрный список перестанет работать для всех',
    ],
    correct: 1,
    explain: 'Без скобок условие «>10 покупок» относится только к чеку, а C∧¬D пропускает любого участника программы лояльности.',
  },
  {
    q: 'Чему по закону де Моргана равно ¬(B ∨ C)?',
    options: ['¬B ∨ ¬C', '¬B ∧ ¬C', 'B ∧ C', '¬B ∧ C'],
    correct: 1,
    explain: 'Отрицание дизъюнкции — конъюнкция отрицаний.',
  },
  {
    q: 'Олег: 5 покупок, чек 10 000 ₽, в программе лояльности. Попадёт в премиум?',
    options: ['Да', 'Нет'],
    correct: 1,
    explain: 'A = 0 (покупок не больше 10), значит F = 0 независимо от чека и лояльности.',
  },
  {
    q: 'Игорь: 15 покупок, чек 3000 ₽, участвует в лояльности. Попадёт в премиум?',
    options: ['Да', 'Нет'],
    correct: 0,
    explain: 'A = 1, B = 0, C = 1, D = 0 → 1∧(0∨1)∧1 = 1.',
  },
]

// =========================================================== задача 3
export const TASK3_VARS: VarInfo[] = [
  { key: 'X', label: 'Высокий доход', ask: 'У клиента высокий доход?' },
  { key: 'Y', label: 'Положительная кредитная история', ask: 'Кредитная история положительная?' },
  { key: 'Z', label: 'Есть депозит в банке', ask: 'Есть депозит в нашем банке?' },
]

export const TASK3_VARIANTS: Record<Variant, { title: string; short: string; reading: string; rule2: string; f: (x: number, y: number, z: number) => number }> = {
  strict: {
    title: 'Вариант 1: правило 2 = ¬X∧Y∧Z',
    short: '¬X∧Y∧Z',
    reading:
      'Нет высокого дохода, но есть идеальная кредитная история И крупный депозит. Оговорку «даже если история подкачала» считаем опечаткой: история во втором правиле нужна.',
    rule2: `${NOT}X${AND}Y${AND}Z`,
    f: (x, y, z) => +((x && y) || (!x && y && z)),
  },
  deposit: {
    title: 'Вариант 2: правило 2 = ¬X∧Z',
    short: '¬X∧Z',
    reading:
      'Нет высокого дохода, но есть крупный депозит — «даже если кредитная история подкачала». Значит, во втором правиле история не важна.',
    rule2: `${NOT}X${AND}Z`,
    f: (x, y, z) => +((x && y) || (!x && z)),
  },
}

export function task3Interpretation(variant: Variant): string[] {
  const common =
    'СДНФ перечисляет поштучно все «одобряемые» профили клиентов — это готовый набор позитивных тест-кейсов. СКНФ перечисляет все запрещающие комбинации — удобно для валидатора отказов.'
  if (variant === 'strict')
    return [
      'Простые импликанты X∧Y и Y∧Z — обе существенные: без любой из них часть клиентов потеряется.',
      'Итог F = (X∧Y) ∨ (Y∧Z) = Y∧(X∨Z): положительная кредитная история обязательна всегда, а дальше достаточно ЛИБО высокого дохода, ЛИБО депозита.',
      'Для IT: первым проверяем Y (самый «отсекающий» запрос в бюро кредитных историй). При Y = 0 сразу отказ — запросы о доходе и депозите не нужны.',
      common,
    ]
  return [
    'Получились три простые импликанты: X∧Y, ¬X∧Z и Y∧Z. Существенные — X∧Y (только она покрывает m6) и ¬X∧Z (только она покрывает m1).',
    'Импликанта Y∧Z (история + депозит) — консенсус двух других и лишняя: все такие клиенты уже одобрены первыми двумя правилами. Это дублирующая проверка, которую не нужно программировать.',
    'Итог F = (X∧Y) ∨ (¬X∧Z): при высоком доходе решает кредитная история, без высокого дохода — наличие депозита. Это мультиплексор: X выбирает, какой фактор смотреть.',
    'Для IT: одно ветвление `if X then return Y else return Z` — ровно одна дополнительная проверка на каждой ветке.',
    common,
  ]
}

export interface Task3Solution {
  steps: Step[]
  qm: QMResult
  minterms: number[]
}

export function solveTask3(variant: Variant): Task3Solution {
  const meta = TASK3_VARIANTS[variant]
  const table = tableRows(['X', 'Y', 'Z'], {
    'X∧Y': (x, y) => x && y,
    [meta.rule2]: (x, y, z) => !!meta.f(x, y, z) && !(x && y),
    F: meta.f,
  })
  const minterms = table.rows.map((r, i) => (r[r.length - 1] ? i : -1)).filter((i) => i >= 0)
  const qm = quineMcCluskey(minterms, ['X', 'Y', 'Z'])
  return {
    minterms,
    qm,
    steps: [
      { title: 'Как читаем правило 2', text: meta.reading },
      {
        title: 'Функция по бизнес-правилам',
        text: 'Правила связаны «или»: достаточно выполнения любого из них.',
        formula: `F(X,Y,Z) = (X${AND}Y) ${OR} (${meta.rule2})`,
      },
      {
        title: 'Таблица истинности и номера наборов',
        text: `Номер набора — двоичное число XYZ. Функция равна 1 на наборах ${minterms.map((m) => 'm' + m).join(', ')}.`,
        table: { ...table, resultCols: 1, highlight: minterms },
      },
      {
        title: 'СДНФ — по единицам функции',
        text: 'Для каждого набора с F = 1 пишем конъюнкцию всех переменных: 1 → переменная, 0 → её отрицание.',
        formula: 'F = ' + qm.sdnf,
      },
      {
        title: 'СКНФ — по нулям функции',
        text: 'Для каждого набора с F = 0 пишем дизъюнкцию: 0 → переменная, 1 → её отрицание.',
        formula: 'F = ' + qm.sknf,
      },
      {
        title: 'Склеивание (метод Квайна)',
        law: 'Закон склеивания: (P∧x) ∨ (P∧¬x) = P',
        text: 'Группируем наборы по числу единиц и склеиваем термы соседних групп, отличающиеся в одной позиции. Несклеившиеся термы — простые импликанты.',
        block: 'qmStages',
      },
      {
        title: 'Импликантная таблица Квайна',
        text: 'Строки — простые импликанты, столбцы — наборы СДНФ. Если в столбце одна отметка, импликанта существенная и обязательно входит в ответ.',
        block: 'qmChart',
      },
      { title: 'Минимальная ДНФ', formula: 'F = ' + qm.minimal_dnf },
      { title: 'Интерпретация для IT-отдела', text: task3Interpretation(variant).join('\n') },
    ],
  }
}

export function task3Questions(variant: Variant): Question[] {
  const s = solveTask3(variant)
  const shared: Question[] = [
    {
      q: 'Какому номеру набора соответствует клиент «нет высокого дохода, история хорошая, депозит есть» (X=0, Y=1, Z=1)?',
      options: ['m1', 'm3', 'm5', 'm6'],
      correct: 1,
      explain: 'Двоичное 011 = 3.',
    },
    {
      q: 'По каким наборам строится СДНФ?',
      options: ['По наборам, где F = 0', 'По наборам, где F = 1', 'По всем наборам', 'Только по первому и последнему'],
      correct: 1,
      explain: 'СДНФ — дизъюнкция минтермов наборов, на которых функция истинна; СКНФ — по нулям.',
    },
    {
      q: 'Что даёт склеивание (¬X∧Y∧Z) ∨ (X∧Y∧Z)?',
      options: ['X∧Y', 'Y∧Z', '¬X∧Z', 'X∧Z'],
      correct: 1,
      explain: 'Термы отличаются только X, поэтому X выпадает: m3 и m7 → Y∧Z (шаблон -11).',
    },
  ]
  if (variant === 'strict')
    return [
      {
        q: 'На каких наборах F = (X∧Y) ∨ (¬X∧Y∧Z) равна 1?',
        options: ['m3, m6, m7', 'm1, m3, m6, m7', 'm6, m7', 'm2, m3, m7'],
        correct: 0,
        explain: 'X∧Y даёт m6 (110) и m7 (111), ¬X∧Y∧Z — m3 (011).',
      },
      ...shared,
      {
        q: 'Сколько существенных импликант в таблице Квайна?',
        options: ['1', '2', '3', '0'],
        correct: 1,
        explain: 'X∧Y — единственная для m6, Y∧Z — единственная для m3. Обе существенные.',
      },
      {
        q: 'Какая минимальная форма получилась?',
        options: ['X∧Y∧Z', 'Y∧(X∨Z)', 'X∨(Y∧Z)', '(X∧Y)∨(¬X∧Z)'],
        correct: 1,
        explain: `Минимальная ДНФ ${s.qm.minimal_dnf}, после вынесения Y: Y∧(X∨Z).`,
      },
      {
        q: 'Что это значит для IT-отдела?',
        options: [
          'Сначала проверяем доход',
          'Без положительной кредитной истории — сразу отказ',
          'Депозит обязателен всегда',
          'Решение принимается случайно',
        ],
        correct: 1,
        explain: 'Y входит в обе импликанты, поэтому проверка истории идёт первой и отсекает лишние запросы.',
      },
    ]
  return [
    {
      q: 'На каких наборах F = (X∧Y) ∨ (¬X∧Z) равна 1?',
      options: ['m3, m6, m7', 'm1, m3, m6, m7', 'm1, m3, m5, m7', 'm6, m7'],
      correct: 1,
      explain: 'X∧Y → m6, m7; ¬X∧Z → m1 (001) и m3 (011).',
    },
    ...shared,
    {
      q: 'Какая импликанта оказалась лишней в таблице Квайна?',
      options: ['X∧Y', '¬X∧Z', 'Y∧Z', 'Лишних нет'],
      correct: 2,
      explain: 'Y∧Z покрывает m3 и m7, но их уже покрыли существенные ¬X∧Z и X∧Y.',
    },
    {
      q: 'Какая минимальная форма получилась?',
      options: ['Y∧(X∨Z)', '(X∧Y)∨(¬X∧Z)', '(X∧Y)∨(Y∧Z)∨(¬X∧Z)', 'X∨Z'],
      correct: 1,
      explain: `Минимальная ДНФ ${s.qm.minimal_dnf} — мультиплексор по X.`,
    },
  ]
}

export function task3Decide(variant: Variant, x: number, y: number, z: number) {
  const approved = !!TASK3_VARIANTS[variant].f(x, y, z)
  const m = x * 4 + y * 2 + z
  let reason: string
  if (x && y) reason = 'Правило 1: высокий доход и положительная кредитная история.'
  else if (approved) reason = variant === 'strict' ? 'Правило 2: хорошая история и депозит без высокого дохода.' : 'Правило 2: без высокого дохода, но есть депозит.'
  else if (x) reason = 'Доход высокий, но кредитная история не положительная — правило 1 не выполнено, а правило 2 требует ¬X.'
  else reason = variant === 'strict' ? 'Без высокого дохода нужны и хорошая история, и депозит.' : 'Без высокого дохода нужен депозит.'
  return { approved, minterm: m, reason }
}

// =========================================================== каталог
export const TASKS: { id: TaskId; route: string; title: string; text: string; formula: string }[] = [
  {
    id: 'task1',
    route: '/task/1',
    title: 'Кредитная заявка',
    text: 'Автоодобрение в «Навигатор BI»: формализация, минимизация и поиск нарушений Process Mining.',
    formula: 'A∧(B∨C)',
  },
  {
    id: 'task2',
    route: '/task/2',
    title: 'Сегмент «Премиум»',
    text: 'BI-аналитика магазина: приоритет операций, законы де Моргана, SQL и тест-кейсы.',
    formula: 'A∧(B∨C)∧¬D',
  },
  {
    id: 'task3',
    route: '/task/3',
    title: 'Премиальная карта',
    text: 'Кредитный лимит: таблица Квайна, СДНФ и СКНФ — в двух прочтениях бизнес-правила.',
    formula: 'СДНФ · СКНФ',
  },
]
