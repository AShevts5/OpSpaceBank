import { useMemo, useState } from 'react'
import { QMChart, QMStages } from '../components/Solution'
import { saveResult } from '../lib/store'
import { parseMinterms, quineMcCluskey, tableRows } from '../logic/boolean'

const PRESETS: { label: string; vars: string; minterms: string }[] = [
  { label: 'Задача 1', vars: 'A B C', minterms: '5, 6, 7' },
  { label: 'Задача 3 · вариант 1', vars: 'X Y Z', minterms: '3, 6, 7' },
  { label: 'Задача 3 · вариант 2', vars: 'X Y Z', minterms: '1, 3, 6, 7' },
  { label: 'Задача 2', vars: 'A B C D', minterms: '10, 12, 14' },
  { label: 'Два минимальных покрытия', vars: 'A B C', minterms: '0, 1, 2, 5, 6, 7' },
]

/** Свободный режим: любая функция до 6 переменных → СДНФ, СКНФ, склеивание и таблица Квайна. */
export default function Constructor() {
  const [vars, setVars] = useState('X Y Z')
  const [mins, setMins] = useState('1, 3, 6, 7')
  const [checked, setChecked] = useState<Set<number> | null>(null)

  const names = vars.split(/[\s,;]+/).filter(Boolean).slice(0, 6)
  const parsed = useMemo(() => {
    try {
      if (names.length < 1) throw new Error('Укажите хотя бы одну переменную')
      if (new Set(names).size !== names.length) throw new Error('Имена переменных повторяются')
      const list = checked ? [...checked].sort((a, b) => a - b) : parseMinterms(mins, names.length)
      return { list, qm: quineMcCluskey(list, names), error: null as string | null }
    } catch (e) {
      return { list: [], qm: null, error: (e as Error).message }
    }
  }, [vars, mins, checked]) // eslint-disable-line react-hooks/exhaustive-deps

  const table = names.length && names.length <= 6 ? tableRows(names, { F: (...b) => +parsed.list.includes(b.reduce((a, x) => (a << 1) | x, 0)) }) : null

  const toggle = (m: number) => {
    const s = new Set(checked ?? parsed.list)
    if (s.has(m)) s.delete(m)
    else s.add(m)
    setChecked(s)
    setMins([...s].sort((a, b) => a - b).join(', '))
  }

  return (
    <div className="wrap page">
      <div className="page__head">
        <p className="eyebrow">Свободный режим</p>
        <h1>Конструктор бизнес-правил</h1>
        <p className="muted">Задайте переменные и наборы, где правило даёт «одобрить» (F = 1), — получите СДНФ, СКНФ, ход склеивания и импликантную таблицу Квайна.</p>
      </div>
      <div className="card p-5 grid gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn"
              onClick={() => {
                setVars(p.vars)
                setMins(p.minterms)
                setChecked(null)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <label className="grid gap-1 text-sm">
            Переменные (до 6, через пробел)
            <input className="input font-mono" value={vars} onChange={(e) => (setVars(e.target.value), setChecked(null))} />
          </label>
          <label className="grid gap-1 text-sm">
            Номера наборов, где F = 1 (можно диапазоны: 1, 3, 6-7)
            <input className="input font-mono" value={mins} onChange={(e) => (setMins(e.target.value), setChecked(null))} />
          </label>
        </div>
        {parsed.error ? <p className="auth__error">{parsed.error}</p> : null}
        <div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!parsed.qm}
            onClick={() => parsed.qm && saveResult({ task: 'custom', mode: 'custom', input: { variables: names, minterms: parsed.list }, result: { minimal: parsed.qm.minimal_dnf } })}
          >
            Сохранить в историю
          </button>
        </div>
      </div>

      {parsed.qm && table ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="card p-4 grid gap-2">
              <p className="eyebrow">Таблица истинности · нажмите на строку, чтобы переключить F</p>
              <div className="scroll-x" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="tt">
                  <thead>
                    <tr>
                      <th>№</th>
                      {table.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r, i) => (
                      <tr key={i} className={r[r.length - 1] ? 'is-hl' : undefined} onClick={() => toggle(i)} style={{ cursor: 'pointer' }}>
                        <td className="is-zero">m{i}</td>
                        {r.map((v, k) => (
                          <td key={k} className={`${k === r.length - 1 ? 'is-res' : ''} ${v ? 'is-one' : 'is-zero'}`}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="grid gap-4 content-start">
              <div className="card answer">
                <p className="eyebrow" style={{ color: 'var(--accent)' }}>
                  Минимальная ДНФ
                </p>
                <h2 className="font-mono" style={{ fontSize: 22 }}>
                  F = {parsed.qm.minimal_dnf}
                </h2>
                {parsed.qm.all_minimal_covers.length > 1 ? <p className="text-sm muted">Есть {parsed.qm.all_minimal_covers.length} равноценных минимальных покрытия — показано одно из них.</p> : null}
              </div>
              <div className="card p-4 grid gap-2">
                <p className="eyebrow">СДНФ</p>
                <div className="formula" style={{ whiteSpace: 'normal' }}>
                  {parsed.qm.sdnf}
                </div>
                <p className="eyebrow">СКНФ</p>
                <div className="formula" style={{ whiteSpace: 'normal' }}>
                  {parsed.qm.sknf}
                </div>
              </div>
            </div>
          </div>
          {parsed.list.length ? (
            <>
              <div className="card p-5 grid gap-3">
                <h2 className="text-xl font-display font-bold">Склеивание</h2>
                <QMStages qm={parsed.qm} />
              </div>
              <div className="card p-5 grid gap-3">
                <h2 className="text-xl font-display font-bold">Импликантная таблица Квайна</h2>
                <QMChart qm={parsed.qm} />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
