/** HTTP-клиент: JWT в заголовке, автоматический refresh с ротацией, понятные ошибки. */

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export interface User {
  id: string
  email: string | null
  login: string | null
  name: string | null
  avatar_url: string | null
  totp_enabled: boolean
  has_password: boolean
  yandex_linked: boolean
  created_at: string
}

export interface Tokens {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

export interface Challenge {
  two_factor_required?: boolean
  two_factor_setup_required?: boolean
  challenge: string
}

export interface ServerConfig {
  app_name: string
  auth: { yandex: boolean; require_2fa: boolean }
  assistant: { llm: boolean; provider: string }
}

const KEY = 'osb-tokens'

export const tokenStore = {
  get(): { access: string; refresh: string } | null {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  set(access: string, refresh: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ access, refresh }))
    } catch {
      /* приватный режим — живём без сохранения */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
  },
}

let refreshing: Promise<boolean> | null = null
let onExpired: (() => void) | null = null
export const setOnExpired = (fn: () => void) => (onExpired = fn)

async function refresh(): Promise<boolean> {
  const t = tokenStore.get()
  if (!t) return false
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return false
        const data = (await r.json()) as Tokens
        tokenStore.set(data.access_token, data.refresh_token)
        return true
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0)
      })
  }
  return refreshing
}

function detail(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const d = (data as { detail: unknown }).detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, '')
  }
  if (status >= 500) return 'Сервер временно недоступен.'
  return `Ошибка ${status}`
}

export async function request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean; raw?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = init
  const doFetch = () => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const t = tokenStore.get()
    if (auth && t) headers.Authorization = `Bearer ${t.access}`
    return fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }
  let resp: Response
  try {
    resp = await doFetch()
  } catch {
    throw new ApiError('Нет связи с сервером.', 0)
  }
  if (resp.status === 401 && auth && tokenStore.get()) {
    if (await refresh()) resp = await doFetch()
    else {
      tokenStore.clear()
      onExpired?.()
    }
  }
  if (init.raw) return resp as unknown as T
  if (resp.status === 204) return undefined as T
  const data = await resp.json().catch(() => null)
  if (!resp.ok) throw new ApiError(detail(data, resp.status), resp.status)
  return data as T
}

/** Запрос со стримингом (SSE поверх fetch — EventSource не умеет POST и заголовки). */
export async function streamChat(
  body: { message: string; session_id?: string | null; context?: string },
  on: { session?: (id: string) => void; delta: (text: string) => void; done?: (source: string) => void },
  signal?: AbortSignal,
): Promise<void> {
  const send = () => {
    const t = tokenStore.get()
    return fetch(`${API_BASE}/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t.access}` } : {}) },
      body: JSON.stringify(body),
      signal,
    })
  }
  let resp = await send()
  if (resp.status === 401 && (await refresh())) resp = await send()
  if (!resp.ok || !resp.body) {
    const data = await resp.json().catch(() => null)
    throw new ApiError(detail(data, resp.status), resp.status)
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const event = /^event: (.+)$/m.exec(chunk)?.[1]
      const dataLine = /^data: (.+)$/m.exec(chunk)?.[1]
      if (!event || !dataLine) continue
      const data = JSON.parse(dataLine)
      if (event === 'session') on.session?.(data.session_id)
      else if (event === 'delta') on.delta(data.text)
      else if (event === 'done') on.done?.(data.source)
    }
  }
}

export const api = {
  config: () => request<ServerConfig>('/config', { auth: false }),
  register: (email: string, password: string, name?: string) =>
    request<Tokens | Challenge>('/auth/register', { method: 'POST', body: { email, password, name }, auth: false }),
  login: (login: string, password: string) => request<Tokens | Challenge>('/auth/login', { method: 'POST', body: { login, password }, auth: false }),
  verify2fa: (challenge: string, code: string) => request<Tokens>('/auth/2fa/verify', { method: 'POST', body: { challenge, code }, auth: false }),
  logout: (refresh_token: string) => request<void>('/auth/logout', { method: 'POST', body: { refresh_token }, auth: false }),
  me: () => request<User>('/auth/me'),
  updateMe: (name: string) => request<User>('/auth/me', { method: 'PATCH', body: { name } }),
  changePassword: (old_password: string | null, new_password: string) =>
    request<void>('/auth/password', { method: 'POST', body: { old_password, new_password } }),
  totpSetup: () => request<{ secret: string; otpauth_uri: string }>('/auth/2fa/setup', { method: 'POST' }),
  totpEnable: (code: string) => request<{ recovery_codes: string[]; tokens?: Tokens }>('/auth/2fa/enable', { method: 'POST', body: { code } }),
  totpDisable: (code: string) => request<void>('/auth/2fa/disable', { method: 'POST', body: { code } }),
  recoveryCodes: (code: string) => request<{ recovery_codes: string[] }>('/auth/2fa/recovery-codes', { method: 'POST', body: { code } }),
  history: () => request<HistoryItem[]>('/history'),
  pushHistory: (items: HistoryItem[]) => request<HistoryItem[]>('/history', { method: 'POST', body: items }),
  clearHistory: () => request<void>('/history', { method: 'DELETE' }),
  chatSessions: () => request<{ id: string; title: string; updated_at: string }[]>('/assistant/sessions'),
  chatMessages: (id: string) => request<{ id: number; role: 'user' | 'assistant'; content: string; source: string | null }[]>(`/assistant/sessions/${id}`),
}

export interface HistoryItem {
  id?: number
  task: 'task1' | 'task2' | 'task3' | 'custom'
  mode: string
  variant?: string | null
  input?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
  score?: number | null
  total?: number | null
  client_uid?: string
  created_at?: string
}

export function yandexLoginUrl(platform: 'web' | 'mobile' = 'web', linkToken?: string): string {
  const base = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`
  const q = new URLSearchParams({ platform })
  if (linkToken) q.set('link_token', linkToken)
  return `${base}/auth/yandex/login?${q}`
}
