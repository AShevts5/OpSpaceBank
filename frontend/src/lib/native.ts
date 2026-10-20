/**
 * Мостик к Capacitor. В браузере всё работает как обычная PWA;
 * в мобильном приложении вход через Яндекс открывается во встроенном браузере,
 * а сервер возвращает нас обратно по deep link ru.opspacebank.app://oauth#...
 */
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { yandexLoginUrl } from './api'

export const isNative = () => Capacitor.isNativePlatform()

export async function startYandexLogin(linkToken?: string): Promise<void> {
  if (isNative()) {
    await Browser.open({ url: yandexLoginUrl('mobile', linkToken) })
  } else {
    window.location.href = yandexLoginUrl('web', linkToken)
  }
}

/** Слушаем возврат из Яндекса в нативном приложении и передаём фрагмент в обработчик. */
export function listenOAuthReturn(handle: (fragment: string) => void): () => void {
  if (!isNative()) return () => undefined
  const sub = App.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith('ru.opspacebank.app://oauth')) return
    Browser.close().catch(() => undefined)
    handle(url.split('#')[1] ?? '')
  })
  return () => {
    sub.then((s) => s.remove())
  }
}
