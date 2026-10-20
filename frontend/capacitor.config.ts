import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Мобильное приложение — та же сборка интерфейса (dist) в нативной оболочке.
 * Адрес API вшивается при сборке: создайте .env.mobile с VITE_API_BASE=https://<сервер>/api/v1
 *
 *   npm run build:mobile     # сборка + cap sync
 *   npm run cap:android      # открыть в Android Studio и собрать APK
 *
 * Вход через Яндекс в приложении: сервер возвращает на ru.opspacebank.app://oauth —
 * эту схему регистрирует intent-filter (см. README, раздел «Capacitor»).
 */
const config: CapacitorConfig = {
  appId: 'ru.opspacebank.app',
  appName: 'OpSpaceBank',
  webDir: 'dist',
  backgroundColor: '#03241A',
  android: { allowMixedContent: true },
  server: { androidScheme: 'https', cleartext: true },
  plugins: {
    StatusBar: { backgroundColor: '#063A2A', style: 'DARK', overlaysWebView: false },
  },
}

export default config
