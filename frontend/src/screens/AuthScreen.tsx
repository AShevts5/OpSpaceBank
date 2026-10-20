import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../lib/api'
import type { Tokens } from '../lib/api'
import { startYandexLogin } from '../lib/native'
import { useSession } from '../lib/session'
import { EyeIcon, YandexIcon } from '../components/Icons'
import { TotpSetup } from './Profile'
import type { PostcardRect } from './EnterTransition'

type Mode = 'login' | 'register' | 'twofa' | 'setup2fa'

interface Props {
  initialChallenge?: { kind: 'verify' | 'setup'; token: string } | null
  initialError?: string | null
  onSignedIn: (tokens: Tokens, from: PostcardRect | null) => void
  onGuest: (from: PostcardRect | null) => void
}

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Не удалось связаться с сервером.')

/**
 * Вход: слева «открытка» со зданием банка, справа окно авторизации.
 * После входа открытка разворачивается на весь экран и «камера» влетает в двери (EnterTransition).
 */
export default function AuthScreen({ initialChallenge, initialError, onSignedIn, onGuest }: Props) {
  const { config, online } = useSession()
  const [mode, setMode] = useState<Mode>(initialChallenge ? (initialChallenge.kind === 'setup' ? 'setup2fa' : 'twofa') : 'login')
  const [challenge, setChallenge] = useState<string | null>(initialChallenge?.token ?? null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const art = useRef<HTMLElement>(null)
  const yandexReady = config?.auth.yandex ?? false

  /** Где сейчас открытка — оттуда стартует анимация входа. */
  const rect = (): PostcardRect | null => {
    const el = art.current
    if (!el || window.innerWidth < 860) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height, rotate: -1.6 }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setPassword('')
    setPassword2('')
    setCode('')
  }

  function handle(result: Tokens | { two_factor_required?: boolean; two_factor_setup_required?: boolean; challenge: string }) {
    if ('access_token' in result) onSignedIn(result, rect())
    else {
      setChallenge(result.challenge)
      setMode(result.two_factor_setup_required ? 'setup2fa' : 'twofa')
      setPassword('')
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') handle(await api.login(email, password))
      else if (mode === 'register') {
        if (password !== password2) throw new ApiError('Пароли не совпадают.', 422)
        handle(await api.register(email, password, name || undefined))
      } else if (mode === 'twofa' && challenge) onSignedIn(await api.verify2fa(challenge, code), rect())
    } catch (err) {
      setError(msg(err))
      if (mode === 'twofa' && err instanceof ApiError && /истекл|заново/i.test(err.message)) switchMode('login')
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Вход в банк',
    register: 'Открыть счёт · регистрация',
    twofa: 'Подтверждение входа',
    setup2fa: 'Настройка двухфакторной защиты',
  }

  const pwField = (id: string, label: string, value: string, set: (v: string) => void, ac: string) => (
    <label className="auth__field" htmlFor={id}>
      <span>{label}</span>
      <span className="auth__pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)} placeholder="••••••••" autoComplete={ac} minLength={mode === 'login' ? undefined : 8} required />
        <button type="button" className="auth__eye" aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShow((v) => !v)}>
          <EyeIcon open={show} />
        </button>
      </span>
    </label>
  )

  return (
    <div className="auth force-dark">
      <div className="auth__deco" aria-hidden="true">
        <i className="auth__spark auth__spark--1" />
        <i className="auth__spark auth__spark--2" />
        <i className="auth__spark auth__spark--3" />
        <i className="auth__spark auth__spark--4" />
        <i className="auth__coin">₽</i>
      </div>

      <div className="auth__stage">
        <figure className="auth__art" ref={art}>
          <img src="/art/bank.svg" alt="Здание банка с колоннами" />
          <figcaption>
            <b>OpSpaceBank</b>
            <span>Учебный банк, где каждое бизнес-правило — логическая функция. Войдите, чтобы попасть в операционный зал.</span>
          </figcaption>
        </figure>
      </div>

      <div className="auth__side">
        <div className="auth__brand">
          <img src="/art/logo-mark.svg" alt="" width={88} height={88} />
          <div>
            <b>
              OpSpace<i>Bank</i>
            </b>
            <span>Помощник банка: дискретная математика в бизнес-процессах</span>
          </div>
        </div>

        {mode === 'setup2fa' && challenge ? (
          <div className="auth__card">
            <h1>{titles.setup2fa}</h1>
            <p className="auth__hint">На этом сервере вход возможен только с двухфакторной аутентификацией. Подключите приложение-аутентификатор.</p>
            <TotpSetup challengeToken={challenge} onDone={(t) => t && onSignedIn(t, rect())} compact />
            <button type="button" className="auth__link" onClick={() => switchMode('login')}>
              Вернуться ко входу
            </button>
          </div>
        ) : (
          <form className="auth__card" onSubmit={submit}>
            <h1>{titles[mode]}</h1>

            {mode === 'login' || mode === 'register' ? (
              <>
                <button
                  type="button"
                  className={yandexReady ? 'auth__oauth' : 'auth__oauth is-off'}
                  onClick={() => (yandexReady ? startYandexLogin() : setError(online ? 'Вход через Яндекс не настроен на сервере: не заданы ключи приложения.' : 'Для входа через Яндекс нужен интернет.'))}
                >
                  <YandexIcon />
                  Войти с Яндекс ID
                </button>
                <div className="auth__or">
                  <span>или</span>
                </div>
                <label className="auth__field" htmlFor="auth-email">
                  <span>Email</span>
                  <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@mail.ru" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
                </label>
              </>
            ) : null}

            {mode === 'register' ? (
              <label className="auth__field" htmlFor="auth-name">
                <span>Как к вам обращаться</span>
                <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Анна" autoComplete="given-name" />
              </label>
            ) : null}

            {mode === 'login' ? pwField('auth-pass', 'Пароль', password, setPassword, 'current-password') : null}
            {mode === 'register' ? (
              <>
                {pwField('auth-pass', 'Пароль (от 8 символов)', password, setPassword, 'new-password')}
                {pwField('auth-pass2', 'Повторите пароль', password2, setPassword2, 'new-password')}
              </>
            ) : null}

            {mode === 'twofa' ? (
              <>
                <p className="auth__hint">
                  {recovery ? 'Введите один из кодов восстановления — каждый срабатывает один раз.' : 'Введите шестизначный код из приложения-аутентификатора (Яндекс Ключ, Google Authenticator). Код меняется каждые 30 секунд.'}
                </p>
                <label className="auth__field" htmlFor="auth-code">
                  <span>{recovery ? 'Код восстановления' : 'Код подтверждения'}</span>
                  {recovery ? (
                    <input id="auth-code" className="auth__code" value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 11))} placeholder="abcde-fghjk" autoComplete="off" autoCapitalize="none" required autoFocus />
                  ) : (
                    <input id="auth-code" className="auth__code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" required autoFocus />
                  )}
                </label>
                <button
                  type="button"
                  className="auth__link auth__forgot"
                  onClick={() => {
                    setRecovery((v) => !v)
                    setCode('')
                  }}
                >
                  {recovery ? 'Ввести код из приложения' : 'Нет доступа к приложению?'}
                </button>
              </>
            ) : null}

            {error ? (
              <p className="auth__error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="auth__submit" disabled={busy || (!online && mode !== 'twofa')}>
              {busy ? 'Подождите…' : { login: 'Войти', register: 'Зарегистрироваться', twofa: 'Подтвердить', setup2fa: '' }[mode]}
            </button>

            {!online ? <p className="auth__info">Нет сети. Можно продолжить без входа — все задачи работают офлайн.</p> : null}

            <p className="auth__small">Вход по паролю, через Яндекс ID (OAuth 2.0) и с двухфакторной аутентификацией (TOTP). Пароли хранятся только в виде хеша.</p>

            <div className="auth__links">
              {mode === 'login' ? (
                <button type="button" className="auth__link" onClick={() => switchMode('register')}>
                  Зарегистрироваться
                </button>
              ) : (
                <button type="button" className="auth__link" onClick={() => switchMode('login')}>
                  Уже есть аккаунт? Войти
                </button>
              )}
              <span aria-hidden="true">·</span>
              <button type="button" className="auth__link" onClick={() => onGuest(rect())}>
                Продолжить без входа
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
