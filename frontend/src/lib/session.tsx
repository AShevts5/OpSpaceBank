import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setOnExpired, tokenStore } from './api'
import type { ServerConfig, Tokens, User } from './api'
import { syncHistory } from './store'
import { useOnline } from './pwa'

type Status = 'loading' | 'anon' | 'guest' | 'user'

interface SessionValue {
  status: Status
  user: User | null
  config: ServerConfig | null
  online: boolean
  signIn: (tokens: Tokens) => void
  signOut: () => Promise<void>
  enterAsGuest: () => void
  setUser: (u: User) => void
}

const Ctx = createContext<SessionValue | null>(null)
const USER_KEY = 'osb-user'
const GUEST_KEY = 'osb-guest'

function cachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUserState] = useState<User | null>(null)
  const [config, setConfig] = useState<ServerConfig | null>(null)

  const setUser = useCallback((u: User) => {
    setUserState(u)
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u))
    } catch {
      /* noop */
    }
  }, [])

  const reset = useCallback(() => {
    tokenStore.clear()
    try {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(GUEST_KEY)
    } catch {
      /* noop */
    }
    setUserState(null)
    setStatus('anon')
  }, [])

  useEffect(() => {
    setOnExpired(reset)
    api.config().then(setConfig).catch(() => setConfig(null))
    const tokens = tokenStore.get()
    if (!tokens) {
      setStatus(localStorage.getItem(GUEST_KEY) ? 'guest' : 'anon')
      return
    }
    // без сети пускаем по сохранённому профилю — задачи решаются локально
    const offlineUser = cachedUser()
    api
      .me()
      .then((u) => {
        setUser(u)
        setStatus('user')
      })
      .catch((e) => {
        if (offlineUser && e.status === 0) {
          setUserState(offlineUser)
          setStatus('user')
        } else reset()
      })
  }, [reset, setUser])

  useEffect(() => {
    if (online && status === 'user') syncHistory().catch(() => undefined)
  }, [online, status])

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      config,
      online,
      setUser,
      signIn: (t) => {
        tokenStore.set(t.access_token, t.refresh_token)
        try {
          localStorage.removeItem(GUEST_KEY)
        } catch {
          /* noop */
        }
        setUser(t.user)
        setStatus('user')
      },
      signOut: async () => {
        const t = tokenStore.get()
        if (t) await api.logout(t.refresh).catch(() => undefined)
        reset()
      },
      enterAsGuest: () => {
        try {
          localStorage.setItem(GUEST_KEY, '1')
        } catch {
          /* noop */
        }
        setStatus('guest')
      },
    }),
    [status, user, config, online, setUser, reset],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('SessionProvider missing')
  return v
}
