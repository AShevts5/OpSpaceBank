# OpSpaceBank — помощник банка

Учебное приложение по дискретной математике в бизнес-процессах. Пользователь входит в абстрактный банк, после анимации попадает в операционный зал и выбирает одно из трёх «окон» — три задачи:

| Окно | Задача | Что внутри |
|---|---|---|
| 1 | Автоодобрение кредитной заявки («Навигатор BI») | формализация, минимизация `(A∧B)∨(A∧¬B∧C) = A∧(B∨C)`, таблица истинности, **Process Mining** (поиск нарушений в журнале, можно загрузить свой CSV) |
| 2 | Сегмент «Премиум» | `F = A∧(B∨C)∧¬D`, приоритет операций (что даёт формула без скобок), законы де Моргана, SQL, тест-кейсы Анна/Игорь/Олег/Елена + свои клиенты |
| 3 | Премиальная кредитная карта | таблица истинности, **СДНФ, СКНФ, склеивание, импликантная таблица Квайна**, интерпретация для IT. Решена в **двух вариантах**, потому что правило 2 в условии противоречиво |

В каждом окне четыре режима: **пошаговое решение** (шаги открываются по одному, в конце ответ), **наводящие вопросы** (пользователь сам проходит решение, с подсказками и объяснениями), **проверить клиента** (ответы «да/нет» → решение по минимальному правилу) и дополнительная вкладка. Отдельно есть **конструктор правил**: любая функция до 6 переменных → СДНФ/СКНФ/Квайн.

### Задача 3: два прочтения правила 2

| | Правило 2 | Минтермы | Минимальная ДНФ | Простые импликанты |
|---|---|---|---|---|
| Вариант 1 | `¬X∧Y∧Z` (история нужна) | m3, m6, m7 | `(X∧Y) ∨ (Y∧Z) = Y∧(X∨Z)` | X∧Y, Y∧Z — обе существенные |
| Вариант 2 | `¬X∧Z` («даже если история подкачала») | m1, m3, m6, m7 | `(X∧Y) ∨ (¬X∧Z)` | X∧Y, ¬X∧Z — существенные; **Y∧Z — лишняя** (консенсус) |

## Стек

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, PyJWT, pyotp, bcrypt, httpx
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, framer-motion, vite-plugin-pwa (Workbox)
- **Мобильное приложение:** Capacitor 7 (Android и iOS)

## Структура

```
backend/
  app/
    logic/boolean.py     булев движок: таблицы, СДНФ/СКНФ, Квайн — Мак-Класки
    logic/tasks.py       три задачи: решения, Process Mining, классификация клиентов
    routers/auth.py      регистрация, вход, 2FA (TOTP), refresh с ротацией, Яндекс ID
    routers/tasks.py     решения, проверки, история (идемпотентная офлайн-синхронизация)
    routers/assistant.py AI-помощник: SSE-стрим, история диалогов
    services/llm.py      OpenAI-совместимые API (OpenAI, YandexGPT, Ollama…) и Claude
    services/knowledge.py системный промпт + встроенная база ответов (без LLM)
    models.py            ORM-модели
  alembic/versions/0001_initial.py
  tests/                 test_logic.py (логика), test_api.py (сквозной сценарий)
frontend/
  public/art/            bank.svg (здание банка), hall.svg (операционный зал), логотип
  src/logic/             те же алгоритмы на TypeScript — задачи решаются офлайн
  src/screens/           вход, анимация входа, холл, задачи, конструктор, история, профиль
  src/components/        шаги решения, таблица Квайна, мастер вопросов, AI-чат
```

## Запуск для разработки

**1. База данных**
```bash
docker compose up -d db
```

**2. Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # поменяйте JWT_SECRET
alembic upgrade head
uvicorn app.main:app --reload
```
Документация API: http://localhost:8000/api/v1/docs

**3. Frontend**
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173, /api проксируется на :8000
```

**Всё в Docker:** `docker compose up --build` → http://localhost:8080. Для Яндекса в этом случае поставьте `FRONTEND_URL=http://localhost:8080`.

**Тесты:** `cd backend && pytest -q`

## Аутентификация

- **Пароль → JWT.** Access-токен живёт 15 минут, refresh — 30 дней. Refresh хранится в БД только как `jti`. При каждом обновлении старый токен отзывается. Если кто-то повторно предъявит уже использованный refresh, все сессии пользователя гасятся: это защита от кражи токена.
- **2FA (TOTP).** Включается в профиле: QR-код для Яндекс Ключа или Google Authenticator, затем 8 одноразовых кодов восстановления. Вход с 2FA проходит в два шага. После пароля сервер выдаёт короткий `challenge`-JWT (5 минут), который годится только для `/auth/2fa/verify`. `REQUIRE_2FA=true` делает 2FA обязательной: при первом входе пользователя проводят через настройку.
- **Яндекс ID (OAuth 2.0).**
  1. Создайте приложение на https://oauth.yandex.ru/client/new (платформа «Веб-сервисы»).
  2. Redirect URI: `http://localhost:8000/api/v1/auth/yandex/callback`.
  3. Права: email и портрет.
  4. Впишите `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET` в `backend/.env`.

  `state` подписан JWT. Если у пользователя включена 2FA, после Яндекса тоже спрашивается код. Яндекс можно привязать к уже существующему аккаунту из профиля.

## AI-помощник

Кнопка в правом нижнем углу на всех экранах. Ответ приходит потоком (SSE), диалоги сохраняются в БД, помощник знает, на какой странице пользователь. Провайдер задаётся в `.env`:

- `LLM_PROVIDER=none`: встроенная база знаний, работает без ключей;
- YandexGPT: `LLM_PROVIDER=openai`, `LLM_BASE_URL=https://llm.api.cloud.yandex.net/v1`, `LLM_MODEL=gpt://<folder_id>/yandexgpt/latest`, `LLM_FOLDER_ID`, `LLM_API_KEY`;
- OpenAI / DeepSeek / Ollama: `LLM_PROVIDER=openai` со своим `LLM_BASE_URL` и `LLM_MODEL`;
- Claude: `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-sonnet-4-5`.

Если модель недоступна, а также без сети или в гостевом режиме, отвечает встроенная база (в браузере тоже есть её копия).

## PWA и автономный режим

- Установка: кнопка «Установить» в шапке (Chrome, Edge, Android). На iPhone выводится подсказка «Поделиться → На экран Домой». Ярлыки к трём задачам есть в манифесте.
- Офлайн: service worker кеширует оболочку, шрифты и картинки. Все алгоритмы продублированы на TypeScript, поэтому задачи, мастер вопросов, проверки и конструктор работают без сети.
- Синхронизация: результаты сохраняются на устройстве и копятся в очереди. Когда сеть возвращается, они уходят на сервер пачкой. `client_uid` защищает от дублей.
- Новая версия: появляется тост «Доступна новая версия — Обновить».
- Вёрстка адаптивная (телефон, планшет, десктоп), есть светлая и тёмная тема.

## Мобильное приложение (Capacitor)

```bash
cd frontend
echo "VITE_API_BASE=https://<ваш-сервер>/api/v1" > .env.mobile
npm run cap:add:android        # один раз (для iOS: npm run cap:add:ios, нужен macOS + Xcode)
npm run build:mobile           # сборка + cap sync
npm run cap:android            # открыть в Android Studio → Run / Build APK
```

Чтобы вход через Яндекс возвращал в приложение, добавьте в `android/app/src/main/AndroidManifest.xml`, внутрь `<activity>`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="ru.opspacebank.app" android:host="oauth" />
</intent-filter>
```

Для iOS добавьте схему `ru.opspacebank.app` в URL Types (Info.plist). В `CORS_ORIGINS` бэкенда уже есть `capacitor://localhost` и `https://localhost`.

## Дизайн

Композиция повторяет «Академиум» (dekanatonline.ru). Слева «открытка» со зданием, наклонённая и подклеенная скотчем, справа тёмное стеклянное окно входа. После входа открытка разворачивается на весь экран, камера наезжает на двери, вспыхивает свет, и проявляется холл с плитками разделов. Палитра изумрудная с золотом. Здание банка и зал нарисованы с нуля как абстрактные SVG, без символики реальных банков.

## Логотип

Знак OpSpaceBank — «планета-банк»: тёмно-зелёный диск с фасадом банка (фронтон, три колонны, ступени), вокруг — орбита с золотым спутником. Надпись: «OpSpace» жирным + «Bank» акцентным зелёным. Все варианты лежат в `brand/` (SVG и PNG): вертикальный и горизонтальный логотип для светлого и тёмного фона, знак, иконка приложения (скруглённая, maskable для Android и упрощённая для 16–32 px). `brand/logo.py` пересобирает SVG.
