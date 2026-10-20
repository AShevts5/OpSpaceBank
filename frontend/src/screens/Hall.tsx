import { useState } from 'react'
import type { ReactNode } from 'react'
import { openAssistant } from '../components/Assistant'
import { CardIcon, CreditIcon, CrownIcon, GridIcon, HistoryIcon, ShieldIcon, UserIcon } from '../components/Icons'
import { go } from '../lib/router'
import { useSession } from '../lib/session'
import { TASKS } from '../logic/tasks'

const ICONS: Record<string, ReactNode> = {
  task1: <CreditIcon width={26} height={26} />,
  task2: <CrownIcon width={26} height={26} />,
  task3: <CardIcon width={26} height={26} />,
}

/** Операционный зал: три «окна касс» — три задачи, ниже — служебные разделы. */
export default function Hall({ arriving = false }: { arriving?: boolean }) {
  const { user, status } = useSession()
  const [arrive] = useState(arriving)
  const hour = new Date().getHours()
  const hello = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'

  return (
    <section className={arrive ? 'hall hall--arrive' : 'hall'} aria-labelledby="hall-title">
      <div className="hall__bg" style={{ backgroundImage: 'url("/art/hall.svg")' }} role="img" aria-label="Операционный зал банка" />
      <div className="hall__in">
        <div className="hall__head">
          <p className="eyebrow">OpSpaceBank · операционный зал</p>
          <h1 id="hall-title">Вы в холле банка</h1>
          <p className="muted">
            {hello}
            {user?.name ? `, ${user.name}` : status === 'guest' ? ', гость' : ''}! Выберите окно — в каждом разбираем одну бизнес-задачу: подробный алгоритм, наводящие вопросы и итоговый ответ.
          </p>
          <button type="button" className="hall__guard" onClick={() => openAssistant()}>
            <ShieldIcon width={18} height={18} /> Спросить консультанта
          </button>
        </div>

        <div className="hall__grid">
          {TASKS.map((t, i) => (
            <button key={t.id} type="button" className={`hall__tile ${i === 0 ? 'hall__tile--main' : ''}`} onClick={() => go(t.route)}>
              <span className="flex items-center justify-between gap-2">
                <span className="hall__icon">{ICONS[t.id]}</span>
                <span className="hall__num">окно {i + 1}</span>
              </span>
              <b>{t.title}</b>
              <span className="hall__formula">{t.formula}</span>
              <span>{t.text}</span>
            </button>
          ))}
        </div>

        <div className="hall__grid hall__grid--small">
          <button type="button" className="hall__tile hall__tile--sm" onClick={() => go('/constructor')}>
            <span className="hall__icon">
              <GridIcon />
            </span>
            <b>Конструктор правил</b>
            <span>Своя функция → СДНФ, СКНФ и таблица Квайна</span>
          </button>
          <button type="button" className="hall__tile hall__tile--sm" onClick={() => go('/history')}>
            <span className="hall__icon">
              <HistoryIcon />
            </span>
            <b>История решений</b>
            <span>Результаты проверок и наводящих вопросов</span>
          </button>
          <button type="button" className="hall__tile hall__tile--sm" onClick={() => go('/profile')}>
            <span className="hall__icon">
              <UserIcon />
            </span>
            <b>Профиль и защита</b>
            <span>{user?.totp_enabled ? '2FA включена' : 'Включите двухфакторную защиту'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
