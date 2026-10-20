/**
 * История решений на устройстве + очередь отправки.
 * Офлайн всё пишется локально; при появлении сети очередь уходит на сервер пачкой.
 * client_uid делает отправку идемпотентной — повтор после обрыва связи не создаст дублей.
 */
import { api, tokenStore } from './api'
import type { HistoryItem } from './api'

const HISTORY = 'osb-history'
const OUTBOX = 'osb-outbox'

function read(key: string): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function write(key: string, items: HistoryItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, 300)))
  } catch {
    /* переполнено или приватный режим */
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export function localHistory(): HistoryItem[] {
  return read(HISTORY)
}

export function saveResult(item: Omit<HistoryItem, 'client_uid' | 'created_at'>): void {
  const full: HistoryItem = { ...item, client_uid: uid(), created_at: new Date().toISOString() }
  write(HISTORY, [full, ...read(HISTORY)])
  if (tokenStore.get()) {
    write(OUTBOX, [...read(OUTBOX), full])
    if (navigator.onLine) syncHistory().catch(() => undefined)
  }
  window.dispatchEvent(new Event('osb-history'))
}

let syncing = false
export async function syncHistory(): Promise<number> {
  if (syncing || !tokenStore.get()) return 0
  const queue = read(OUTBOX)
  if (!queue.length) return 0
  syncing = true
  try {
    await api.pushHistory(queue)
    const sent = new Set(queue.map((q) => q.client_uid))
    write(OUTBOX, read(OUTBOX).filter((q) => !sent.has(q.client_uid)))
    return queue.length
  } finally {
    syncing = false
  }
}

export function pendingCount(): number {
  return read(OUTBOX).length
}

export function clearLocalHistory(): void {
  write(HISTORY, [])
  write(OUTBOX, [])
  window.dispatchEvent(new Event('osb-history'))
}
