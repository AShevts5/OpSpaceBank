import { useEffect, useState } from 'react'

/** Маленький hash-роутер: hash работает и в PWA офлайн, и внутри Capacitor без настройки сервера. */
export function currentRoute(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/'
}

export function go(to: string): void {
  if (currentRoute() !== to) window.location.hash = to
  window.scrollTo({ top: 0 })
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const on = () => setRoute(currentRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
