import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ApiError, API_BASE, api, tokenStore } from '../lib/api'
import type { Tokens } from '../lib/api'
import { startYandexLogin } from '../lib/native'
import { useSession } from '../lib/session'
import { ShieldIcon, YandexIcon } from '../components/Icons'

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Нет связи с сервером.')

/**
 * Подключение TOTP: QR-код → код из приложения → коды восстановления.
 * challengeToken — если настраиваем прямо при входе (сервер требует 2FA).
 */
export function TotpSetup({ challengeToken, onDone, compact = false }: { challengeToken?: string; onDone: (tokens?: Tokens) => void; compact?: boolean }) {
  const [secret, setSecret] = useState<{ secret: string; otpauth_uri: string } | null>(null)
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [tokens, setTokens] = useState<Tokens | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const call = async <T,>(path: string, body?: unknown): Promise<T> => {
    if (!challengeToken) return path.endsWith('setup') ? (api.totpSetup() as Promise<T>) : (api.totpEnable(String((body as { code: string }).code)) as Promise<T>)
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${challengeToken}` },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) throw new ApiError(data?.detail ?? `Ошибка ${r.status}`, r.status)
    return data as T
  }

  useEffect(() => {
    call<{ secret: string; otpauth_uri: string }>('/auth/2fa/setup')
      .then(async (s) => {
        setSecret(s)
        setQr(await QRCode.toDataURL(s.otpauth_uri, { margin: 1, width: 320, color: { dark: '#063A2A', light: '#FFFFFF' } }))
      })
      .catch((e) => setError(msg(e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const r = await call<{ recovery_codes: string[]; tokens?: Tokens }>('/auth/2fa/enable', { code })
      setCodes(r.recovery_codes)
      setTokens(r.tokens)
      if (r.tokens && !challengeToken) tokenStore.set(r.tokens.access_token, r.tokens.refresh_token)
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  if (codes)
    return (
      <div className="recovery">
        <b>Двухфакторная защита включена. Сохраните коды восстановления:</b>
        <ol>
          {codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ol>
        <p className="text-sm muted">Каждый код срабатывает один раз — если телефон потеряется. Больше мы их не покажем.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>
            Скопировать
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onDone(tokens)}>
            Я сохранил{compact ? ' — войти' : ''}
          </button>
        </div>
      </div>
    )

  return (
    <div className="grid gap-3">
      <div className="totp">
        {qr ? <img className="totp__qr" src={qr} alt="QR-код для приложения-аутентификатора" /> : <div className="totp__qr" />}
        <div className="grid gap-2 text-sm" style={{ flex: '1 1 200px' }}>
          <p>1. Откройте Яндекс Ключ, Google Authenticator или другое TOTP-приложение.</p>
          <p>2. Отсканируйте QR-код или введите ключ вручную:</p>
          {secret ? <code className="break-all p-2 rounded-md" style={{ background: 'var(--sheet-2)' }}>{secret.secret}</code> : null}
          <p>3. Введите 6 цифр из приложения:</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input auth__code" style={{ width: 200, fontSize: 20 }} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
        <button type="button" className="btn btn--primary" disabled={code.length !== 6 || busy} onClick={confirm}>
          Подтвердить
        </button>
      </div>
      {error ? <p className="auth__error">{error}</p> : null}
    </div>
  )
}

export default function Profile() {
  const { user, status, signOut, setUser, config, online } = useSession()
  const [name, setName] = useState(user?.name ?? '')
  const [setup, setSetup] = useState(false)
  const [code, setCode] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [fresh, setFresh] = useState<string[] | null>(null)

  if (status === 'guest' || !user)
    return (
      <div className="wrap page">
        <div className="page__head">
          <h1>Профиль</h1>
          <p className="muted">Вы в гостевом режиме: задачи работают, история хранится на устройстве. Войдите, чтобы синхронизировать историю, включить двухфакторную защиту и общаться с AI-консультантом без ограничений.</p>
        </div>
        <div>
          <button type="button" className="btn btn--primary" onClick={() => signOut()}>
            Войти или зарегистрироваться
          </button>
        </div>
      </div>
    )

  const run = async (fn: () => Promise<void>, ok: string) => {
    setError(null)
    setInfo(null)
    try {
      await fn()
      setInfo(ok)
    } catch (e) {
      setError(msg(e))
    }
  }

  return (
    <div className="wrap page" style={{ maxWidth: 820 }}>
      <div className="page__head">
        <p className="eyebrow">Личный кабинет</p>
        <h1>{user.name || user.email}</h1>
        <p className="muted">{user.email}</p>
      </div>
      {info ? <p className="auth__info">{info}</p> : null}
      {error ? <p className="auth__error">{error}</p> : null}

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-display font-bold">Как к вам обращаться</h2>
        <div className="flex flex-wrap gap-2">
          <input className="input" style={{ maxWidth: 320 }} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn" disabled={!online} onClick={() => run(async () => setUser(await api.updateMe(name)), 'Имя сохранено.')}>
            Сохранить
          </button>
        </div>
      </section>

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <ShieldIcon width={20} height={20} /> Двухфакторная аутентификация
          {user.totp_enabled ? <span className="tag tag--ok">включена</span> : <span className="tag tag--miss">выключена</span>}
        </h2>
        {user.totp_enabled ? (
          <>
            <p className="text-sm muted">При входе после пароля спрашиваем 6-значный код из приложения. Чтобы отключить защиту или выпустить новые коды восстановления, введите текущий код.</p>
            <div className="flex flex-wrap gap-2">
              <input className="input auth__code" style={{ width: 180, fontSize: 18 }} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000" />
              <button
                type="button"
                className="btn"
                disabled={code.length !== 6}
                onClick={() =>
                  run(async () => {
                    setFresh((await api.recoveryCodes(code)).recovery_codes)
                    setCode('')
                  }, 'Выпущены новые коды восстановления — старые больше не действуют.')
                }
              >
                Новые коды восстановления
              </button>
              {!config?.auth.require_2fa ? (
                <button type="button" className="btn btn--danger" disabled={code.length !== 6} onClick={() => run(async () => (await api.totpDisable(code), setUser(await api.me())), '2FA отключена.')}>
                  Отключить
                </button>
              ) : null}
            </div>
            {fresh ? (
              <div className="recovery">
                <b>Новые коды восстановления:</b>
                <ol>
                  {fresh.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                    </li>
                  ))}
                </ol>
                <div>
                  <button type="button" className="btn" onClick={() => setFresh(null)}>
                    Я сохранил
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : setup ? (
          <TotpSetup
            onDone={async () => {
              setSetup(false)
              setUser(await api.me())
              setInfo('Двухфакторная защита включена.')
            }}
          />
        ) : (
          <>
            <p className="text-sm muted">Защитите аккаунт вторым фактором: даже если пароль утечёт, без кода из телефона войти не получится.</p>
            <div>
              <button type="button" className="btn btn--primary" disabled={!online} onClick={() => setSetup(true)}>
                Включить 2FA
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <YandexIcon /> Яндекс ID {user.yandex_linked ? <span className="tag tag--ok">привязан</span> : null}
        </h2>
        {user.yandex_linked ? (
          <p className="text-sm muted">Можно входить кнопкой «Войти с Яндекс ID».</p>
        ) : (
          <div>
            <button type="button" className="btn" disabled={!config?.auth.yandex || !online} onClick={() => startYandexLogin(tokenStore.get()?.access)}>
              Привязать Яндекс ID
            </button>
          </div>
        )}
      </section>

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-display font-bold">{user.has_password ? 'Сменить пароль' : 'Задать пароль'}</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          {user.has_password ? <input className="input" type="password" placeholder="Текущий пароль" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" /> : null}
          <input className="input" type="password" placeholder="Новый пароль (от 8 символов)" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          <button type="button" className="btn" disabled={newPw.length < 8 || !online} onClick={() => run(async () => (await api.changePassword(oldPw || null, newPw), setOldPw(''), setNewPw(''), setUser(await api.me())), 'Пароль обновлён.')}>
            Сохранить
          </button>
        </div>
      </section>

      <div>
        <button type="button" className="btn btn--danger" onClick={() => signOut()}>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}
