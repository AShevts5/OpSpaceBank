import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { HistoryItem } from '../lib/api'
import { useSession } from '../lib/session'
import { clearLocalHistory, localHistory, pendingCount, syncHistory } from '../lib/store'

const TASK_NAME: Record<string, string> = { task1: 'Кредитная заявка', task2: 'Сегмент «Премиум»', task3: 'Премиальная карта', custom: 'Конструктор' }
const MODE_NAME: Record<string, string> = { solution: 'пошаговое решение', wizard: 'наводящие вопросы', check: 'проверка клиента', process_mining: 'Process Mining', custom: 'своя функция' }

function summary(h: HistoryItem): string {
  const r = h.result ?? {}
  if (h.mode === 'wizard') return `${h.score} из ${h.total} верно`
  if ('approved' in r) return r.approved ? 'одобрено' : 'отказ'
  if ('premium' in r && typeof r.premium === 'number') return r.premium ? 'в премиуме' : 'не в премиуме'
  if ('minimal' in r) return `F = ${r.minimal}`
  if ('violations' in r) return `нарушения: ${(r.violations as string[]).join(', ') || 'нет'}`
  return ''
}

export default function History() {
  const { status, online } = useSession()
  const [items, setItems] = useState<HistoryItem[]>(localHistory)
  const [pending, setPending] = useState(pendingCount)
  const [source, setSource] = useState<'local' | 'server'>('local')

  useEffect(() => {
    const on = () => {
      setItems(localHistory())
      setPending(pendingCount())
    }
    window.addEventListener('osb-history', on)
    return () => window.removeEventListener('osb-history', on)
  }, [])

  useEffect(() => {
    if (status !== 'user' || !online) return
    syncHistory()
      .catch(() => 0)
      .then(() => api.history())
      .then((rows) => {
        setItems(rows)
        setSource('server')
        setPending(pendingCount())
      })
      .catch(() => undefined)
  }, [status, online])

  return (
    <div className="wrap page">
      <div className="page__head">
        <p className="eyebrow">{source === 'server' ? 'Синхронизировано с сервером' : 'Сохранено на устройстве'}</p>
        <h1>История решений</h1>
        {pending ? <p className="tag tag--gold justify-self-start">Ждут отправки на сервер: {pending}</p> : null}
        {status === 'guest' ? <p className="muted">Вы вошли как гость — история хранится только на этом устройстве.</p> : null}
      </div>
      {items.length ? (
        <ul className="grid gap-3">
          {items.map((h, i) => (
            <li key={h.client_uid ?? h.id ?? i} className="card hist">
              <span className={`tag ${h.task === 'custom' ? '' : 'tag--ok'}`}>{TASK_NAME[h.task]}</span>
              <div>
                <b className="text-sm">
                  {MODE_NAME[h.mode] ?? h.mode}
                  {h.variant ? ` · ${h.variant === 'strict' ? 'вариант 1' : 'вариант 2'}` : ''}
                </b>
                <span className="text-sm muted font-mono" style={{ overflowWrap: 'anywhere' }}>
                  {summary(h)}
                </span>
              </div>
              <span className="text-xs muted">{h.created_at ? new Date(h.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card p-6 text-center muted">Пока пусто. Решите любую задачу в холле — результат появится здесь.</div>
      )}
      {items.length ? (
        <div>
          <button
            type="button"
            className="btn btn--danger"
            onClick={async () => {
              clearLocalHistory()
              if (status === 'user' && online) await api.clearHistory().catch(() => undefined)
              setItems([])
            }}
          >
            Очистить историю
          </button>
        </div>
      ) : null}
    </div>
  )
}
