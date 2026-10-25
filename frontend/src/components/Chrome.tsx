import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { go } from '../lib/router'
import { useInstall } from '../lib/pwa'
import { useSession } from '../lib/session'
import { useTheme } from '../lib/theme'
import type { Theme } from '../lib/theme'
import { BackIcon, DownloadIcon, MonitorIcon, MoonIcon, SunIcon } from './Icons'

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  const opts: [Theme, string, JSX.Element][] = [
    ['system', 'Как в системе', <MonitorIcon key="s" width={16} height={16} />],
    ['light', 'Светлая', <SunIcon key="l" width={16} height={16} />],
    ['dark', 'Тёмная', <MoonIcon key="d" width={16} height={16} />],
  ]
  return (
    <div className="seg hide-sm" role="group" aria-label="Тема" style={{ width: 'auto' }}>
      {opts.map(([t, label, icon]) => (
        <button key={t} type="button" aria-pressed={theme === t} title={label} aria-label={label} onClick={() => setTheme(t)} style={{ padding: '6px 9px', display: 'grid', flex: 'none' }}>
          {icon}
        </button>
      ))}
    </div>
  )
}

export function InstallButton() {
  const { canInstall, iosHint, install } = useInstall()
  const [tip, setTip] = useState(false)
  if (!canInstall) return null
  return (
    <>
      <button type="button" className="btn btn--quiet" onClick={() => (iosHint ? setTip(true) : install())} title="Установить приложение">
        <DownloadIcon width={18} height={18} />
        <span className="hide-sm">Установить</span>
      </button>
      {tip ? (
        <div className="toast" role="dialog">
          <span>
            На iPhone: нажмите «Поделиться» <b>⎋</b> и выберите «На экран Домой».
          </span>
          <button type="button" className="btn" onClick={() => setTip(false)}>
            Понятно
          </button>
        </div>
      ) : null}
    </>
  )
}

export function TopBar({ route }: { route: string }) {
  const { user, status, online } = useSession()
  const inHall = route === '/' || route === '/hall'
  const initials = (user?.name || user?.email || 'Г').slice(0, 1).toUpperCase()
  return (
    <header className="bar">
      <div className="bar__in">
        {!inHall ? (
          <button type="button" className="btn btn--quiet" onClick={() => go('/')} aria-label="В холл" style={{ paddingInline: 8 }}>
            <BackIcon width={20} height={20} />
          </button>
        ) : null}
        <button type="button" className="brand" onClick={() => go('/')}>
          <img src="/favicon.svg" alt="" width={38} height={38} />
          <span>
            <b>
              OpSpace<span style={{ color: 'var(--accent)' }}>Bank</span>
            </b>
            <small>Цифровой помощник банка</small>
          </span>
        </button>
        <span className="pill hide-sm" title={online ? 'Есть связь с сервером' : 'Работаем автономно'}>
          <i className={online ? 'dot' : 'dot dot--off'} /> {online ? 'онлайн' : 'офлайн'}
        </span>
        <InstallButton />
        <ThemeSwitch />
        <button type="button" className="user-chip" onClick={() => go('/profile')} title="Профиль">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : <i>{initials}</i>}
          <span>{status === 'guest' ? 'Гость' : user?.name || user?.email || 'Профиль'}</span>
        </button>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="site-foot">
      <div className="site-foot__in">
        <span>OpSpaceBank · цифровой помощник банка. Банк, клиенты и заявки вымышлены.</span>
        <span>Решения не являются финансовой рекомендацией.</span>
      </div>
    </footer>
  )
}

export function OfflineBanner() {
  const { online } = useSession()
  if (online) return null
  return (
    <div className="offline" role="status">
      Нет сети — работаем автономно. Задачи решаются на устройстве, результаты отправятся на сервер позже.
    </div>
  )
}

export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  useEffect(() => {
    if (!offlineReady) return
    const t = window.setTimeout(() => setOfflineReady(false), 4000)
    return () => window.clearTimeout(t)
  }, [offlineReady, setOfflineReady])
  if (needRefresh)
    return (
      <div className="toast" role="status">
        <span>Доступна новая версия OpSpaceBank.</span>
        <button type="button" className="btn btn--primary" onClick={() => updateServiceWorker(true)}>
          Обновить
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => setNeedRefresh(false)} style={{ color: 'inherit' }}>
          Позже
        </button>
      </div>
    )
  if (offlineReady)
    return (
      <div className="toast" role="status">
        Приложение сохранено на устройстве и теперь работает без интернета.
      </div>
    )
  return null
}
