/**
 * Булев движок на клиенте — копия backend/app/logic/boolean.py.
 * Нужен для автономного режима: все задачи решаются прямо в браузере.
 * Первая переменная — старший бит: для (X, Y, Z) набор 011 = m3 = ¬X∧Y∧Z.
 */

export const NOT = '¬'
export const AND = '∧'
export const OR = '∨'

export type Bit = 0 | 1

export function assignments(n: number): Bit[][] {
  const out: Bit[][] = []
  for (let i = 0; i < 2 ** n; i++) out.push(bitsOf(i, n).split('').map((c) => (c === '1' ? 1 : 0)) as Bit[])
  return out
}

export function bitsOf(index: number, n: number): string {
  return index.toString(2).padStart(n, '0')
}

export function indexOf(bits: number[]): number {
  return bits.reduce((acc, b) => (acc << 1) | (b ? 1 : 0), 0)
}

export function literal(v: string, bit: string, form: 'dnf' | 'cnf' = 'dnf'): string {
  if (form === 'dnf') return bit === '1' ? v : NOT + v
  return bit === '0' ? v : NOT + v
}

export function patternToTerm(pattern: string, vars: string[]): string {
  const parts = vars.map((v, i) => (pattern[i] === '-' ? null : literal(v, pattern[i]))).filter(Boolean) as string[]
  return parts.length ? parts.join(AND) : '1'
}

export function mintermTerm(i: number, vars: string[]): string {
  return bitsOf(i, vars.length)
    .split('')
    .map((b, k) => literal(vars[k], b))
    .join(AND)
}

export function maxtermTerm(i: number, vars: string[]): string {
  return (
    '(' +
    bitsOf(i, vars.length)
      .split('')
      .map((b, k) => literal(vars[k], b, 'cnf'))
      .join(OR) +
    ')'
  )
}

export function sdnf(minterms: number[], vars: string[]): string {
  const terms = [...minterms].sort((a, b) => a - b).map((m) => mintermTerm(m, vars))
  if (!terms.length) return '0'
  return terms.map((t) => (vars.length > 1 ? `(${t})` : t)).join(` ${OR} `)
}

export function sknf(minterms: number[], vars: string[]): string {
  const ones = new Set(minterms)
  const zeros: number[] = []
  for (let i = 0; i < 2 ** vars.length; i++) if (!ones.has(i)) zeros.push(i)
  if (!zeros.length) return '1'
  return zeros.map((m) => maxtermTerm(m, vars)).join(` ${AND} `)
}

export function dnfFromPatterns(patterns: string[], vars: string[]): string {
  if (!patterns.length) return '0'
  const terms = patterns.map((p) => patternToTerm(p, vars))
  if (terms.length === 1) return terms[0]
  return terms.map((t) => (t.includes(AND) ? `(${t})` : t)).join(` ${OR} `)
}

// ------------------------------------------------------------- Квайн — Мак-Класки
export interface Implicant {
  pattern: string
  minterms: number[]
  term: string
  label: string
}

export interface StageItem extends Implicant {
  used: boolean
}

export interface Merge {
  a: string
  b: string
  result: string
  minterms: number[]
  term: string
}

export interface Stage {
  stage: number
  groups: { ones: number; items: StageItem[] }[]
  merges: Merge[]
  primes_here: string[]
}

export interface ChartRow {
  pattern: string
  term: string
  covers: Record<string, boolean>
}

export interface QMResult {
  variables: string[]
  minterms: number[]
  stages: Stage[]
  prime_implicants: Implicant[]
  chart: ChartRow[]
  essential: Implicant[]
  extra: Implicant[]
  redundant: Implicant[]
  minimal: Implicant[]
  minimal_dnf: string
  all_minimal_covers: string[][]
  sdnf: string
  sknf: string
}

const onesCount = (p: string) => p.split('').filter((c) => c === '1').length

export function covers(pattern: string, index: number): boolean {
  const bits = bitsOf(index, pattern.length)
  for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '-' && pattern[i] !== bits[i]) return false
  return true
}

export function termOrder(p: string): number[] {
  return p.split('').map((c) => (c === '1' ? 0 : c === '0' ? 1 : 2))
}

function cmpOrder(a: string, b: string): number {
  const x = termOrder(a)
  const y = termOrder(b)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

export function tryCombine(a: string, b: string): string | null {
  let diff = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (a[i] === '-' || b[i] === '-' || diff !== -1) return null
      diff = i
    }
  }
  if (diff === -1) return null
  return a.slice(0, diff) + '-' + a.slice(diff + 1)
}

function mk(pattern: string, minterms: number[], vars: string[]): Implicant {
  return { pattern, minterms, term: patternToTerm(pattern, vars), label: `m(${minterms.join(',')})` }
}

function* combinations<T>(arr: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc]
    return
  }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i])
    yield* combinations(arr, k, i + 1, acc)
    acc.pop()
  }
}

export function quineMcCluskey(mintermsIn: number[], vars: string[]): QMResult {
  const n = vars.length
  const mins = [...new Set(mintermsIn)].sort((a, b) => a - b)
  const res: QMResult = {
    variables: vars,
    minterms: mins,
    stages: [],
    prime_implicants: [],
    chart: [],
    essential: [],
    extra: [],
    redundant: [],
    minimal: [],
    minimal_dnf: '0',
    all_minimal_covers: [],
    sdnf: sdnf(mins, vars),
    sknf: sknf(mins, vars),
  }
  if (!mins.length) return res

  let current: Implicant[] = mins.map((m) => mk(bitsOf(m, n), [m], vars))
  const primes: Implicant[] = []
  let stageNo = 0
  while (current.length) {
    const groups = new Map<number, Implicant[]>()
    for (const imp of current) {
      const k = onesCount(imp.pattern)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(imp)
    }
    const used = new Set<string>()
    const merges: Merge[] = []
    const next = new Map<string, Implicant>()
    const keys = [...groups.keys()].sort((a, b) => a - b)
    for (const k of keys) {
      for (const a of groups.get(k) ?? []) {
        for (const b of groups.get(k + 1) ?? []) {
          const c = tryCombine(a.pattern, b.pattern)
          if (!c) continue
          used.add(a.pattern)
          used.add(b.pattern)
          const mt = [...new Set([...a.minterms, ...b.minterms])].sort((x, y) => x - y)
          merges.push({ a: a.pattern, b: b.pattern, result: c, minterms: mt, term: patternToTerm(c, vars) })
          if (!next.has(c)) next.set(c, mk(c, mt, vars))
        }
      }
    }
    const stagePrimes = current.filter((imp) => !used.has(imp.pattern))
    primes.push(...stagePrimes)
    res.stages.push({
      stage: stageNo,
      groups: keys.map((k) => ({ ones: k, items: groups.get(k)!.map((imp) => ({ ...imp, used: used.has(imp.pattern) })) })),
      merges,
      primes_here: stagePrimes.map((p) => p.pattern),
    })
    current = [...next.values()]
    stageNo++
  }

  const uniq = new Map<string, Implicant>()
  for (const p of primes) if (!uniq.has(p.pattern)) uniq.set(p.pattern, p)
  const primeList = [...uniq.values()].sort((a, b) => cmpOrder(a.pattern, b.pattern))
  res.prime_implicants = primeList
  res.chart = primeList.map((p) => ({
    pattern: p.pattern,
    term: p.term,
    covers: Object.fromEntries(mins.map((m) => [String(m), covers(p.pattern, m)])),
  }))

  const essential: Implicant[] = []
  for (const m of mins) {
    const c = primeList.filter((p) => covers(p.pattern, m))
    if (c.length === 1 && !essential.includes(c[0])) essential.push(c[0])
  }
  res.essential = [...essential].sort((a, b) => cmpOrder(a.pattern, b.pattern))
  const covered = new Set(mins.filter((m) => essential.some((p) => covers(p.pattern, m))))
  const rest = mins.filter((m) => !covered.has(m))
  const candidates = primeList.filter((p) => !essential.includes(p))
  let best: Implicant[][] = []
  if (rest.length) {
    for (let size = 1; size <= candidates.length && !best.length; size++) {
      for (const combo of combinations(candidates, size)) {
        if (rest.every((m) => combo.some((p) => covers(p.pattern, m)))) best.push(combo)
      }
    }
    const lits = (c: Implicant[]) => c.reduce((s, p) => s + p.pattern.replace(/-/g, '').length, 0)
    best.sort((a, b) => lits(a) - lits(b))
  }
  res.extra = best[0] ?? []
  res.minimal = [...essential, ...res.extra].sort((a, b) => cmpOrder(a.pattern, b.pattern))
  res.redundant = primeList.filter((p) => !res.minimal.includes(p))
  res.all_minimal_covers = best.length
    ? best.map((c) => [...essential, ...c].map((p) => p.pattern))
    : [essential.map((p) => p.pattern)]
  res.minimal_dnf = dnfFromPatterns(
    res.minimal.map((p) => p.pattern),
    vars,
  )
  return res
}

export interface Table {
  columns: string[]
  rows: number[][]
}

export function tableRows(vars: string[], columns: Record<string, (...b: number[]) => number | boolean>): Table {
  return {
    columns: [...vars, ...Object.keys(columns)],
    rows: assignments(vars.length).map((bits) => [...bits, ...Object.values(columns).map((f) => (f(...bits) ? 1 : 0))]),
  }
}

/** Разбор минтермов вида «1, 3, 6-7» из поля ввода конструктора. */
export function parseMinterms(text: string, n: number): number[] {
  const out = new Set<number>()
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      for (let i = +range[1]; i <= +range[2]; i++) out.add(i)
    } else if (/^\d+$/.test(part)) out.add(+part)
    else throw new Error(`Не понимаю «${part}»`)
  }
  for (const m of out) if (m >= 2 ** n) throw new Error(`Набор ${m} вне диапазона 0…${2 ** n - 1}`)
  return [...out].sort((a, b) => a - b)
}
