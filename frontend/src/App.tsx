import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Assistant from './components/Assistant'
import { Footer, OfflineBanner, TopBar, UpdateToast } from './components/Chrome'
import { api, tokenStore } from './lib/api'
import type { Tokens } from './lib/api'
import { listenOAuthReturn } from './lib/native'
import { go, useRoute } from './lib/router'
import { useSession } from './lib/session'
import AuthScreen from './screens/AuthScreen'
import Constructor from './screens/Constructor'
import EnterTransition from './screens/EnterTransition'
import type { PostcardRect } from './screens/EnterTransition'
import Hall from './screens/Hall'
import History from './screens/History'
import Profile from './screens/Profile'
import { Task1, Task2, Task3 } from './screens/Tasks'

type OAuthResult = { challenge?: { kind: 'verify' | 'setup'; token: string }; error?: string; tokens?: { access: string; refresh: string } }

/** Разбор фрагмента, с которым сервер вернул нас из Яндекса. */
function parseOAuth(fragment: string): OAuthResult | null {
  const p = new URLSearchParams(fragment)
  if (p.get('access_token') && p.get('refresh_token')) return { tokens: { access: p.get('access_token')!, refresh: p.get('refresh_token')! } }
  if (p.get('challenge')) return { challenge: { kind: 'verify', token: p.get('challenge')! } }
  if (p.get('setup_challenge')) return { challenge: { kind: 'setup', token: p.get('setup_challenge')! } }
  if (p.get('error')) return { error: p.get('error')! }
  return null
}

function initialOAuth(): OAuthResult | null {
  if (window.location.pathname !== '/oauth') return null
  const res = parseOAuth(window.location.hash.slice(1))
  window.history.replaceState(null, '', '/#/')
  return res
}

const CONTEXT: Record<string, string> = {
  '/': 'холл банка',
  '/task/1': 'задача 1 — автоодобрение кредитной заявки',
  '/task/2': 'задача 2 — сегмент «Премиум»',
  '/task/3': 'задача 3 — премиальная кредитная карта, таблица Квайна',
  '/constructor': 'конструктор правил (метод Квайна)',
  '/history': 'история решений',
  '/profile': 'профиль и 2FA',
}

export default function App() {
  const { status, signIn, enterAsGuest } = useSession()
  const route = useRoute()
  const [oauth, setOauth] = useState<OAuthResult | null>(initialOAuth)
  const [entering, setEntering] = useState<{ from: PostcardRect | null } | null>(null)
  const [arrived, setArrived] = useState(false)

  const finishOAuthTokens = useCallback(
    async (t: { access: string; refresh: string }) => {
      tokenStore.set(t.access, t.refresh)
      try {
        const user = await api.me()
        signIn({ access_token: t.access, refresh_token: t.refresh, expires_in: 900, user })
        setEntering({ from: null })
      } catch {
        setOauth({ error: 'Не удалось завершить вход через Яндекс.' })
      }
    },
    [signIn],
  )

  useEffect(() => {
    if (oauth?.tokens) {
      const t = oauth.tokens
      setOauth(null)
      finishOAuthTokens(t)
    }
  }, [oauth, finishOAuthTokens])

  // возврат из Яндекса в нативном приложении (Capacitor deep link)
  useEffect(() => listenOAuthReturn((fragment) => setOauth(parseOAuth(fragment))), [])

  const onSignedIn = (t: Tokens, from: PostcardRect | null) => {
    signIn(t)
    setOauth(null)
    go('/')
    setEntering({ from })
  }

  if (status === 'loading')
    return (
      <div className="splash" aria-busy="true">
        <motion.img src="/art/mark.svg" alt="OpSpaceBank" width={88} height={88} animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />
      </div>
    )

  if (status === 'anon')
    return (
      <AuthScreen
        initialChallenge={oauth?.challenge ?? null}
        initialError={oauth?.error ?? null}
        onSignedIn={onSignedIn}
        onGuest={(from) => {
          enterAsGuest()
          go('/')
          setEntering({ from })
        }}
      />
    )

  const page = (() => {
    switch (route) {
      case '/task/1':
        return <Task1 />
      case '/task/2':
        return <Task2 />
      case '/task/3':
        return <Task3 />
      case '/constructor':
        return <Constructor />
      case '/history':
        return <History />
      case '/profile':
        return <Profile />
      default:
        return <Hall arriving={!!entering || arrived} />
    }
  })()

  return (
    <>
      <a className="skip" href="#main">
        К содержимому
      </a>
      <TopBar route={route} />
      <AnimatePresence mode="wait">
        <motion.main id="main" key={route} className="flex-1 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {page}
        </motion.main>
      </AnimatePresence>
      <Footer />
      <Assistant context={CONTEXT[route] ?? route} />
      <OfflineBanner />
      <UpdateToast />
      {entering ? (
        <EnterTransition
          from={entering.from}
          onDone={() => {
            setEntering(null)
            setArrived(true)
            window.setTimeout(() => setArrived(false), 2000)
          }}
        />
      ) : null}
    </>
  )
}
