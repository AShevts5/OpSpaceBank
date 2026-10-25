#!/usr/bin/env bash
# Деплой OpSpaceBank на сервер, где уже работает системный Caddy (порты 80/443) и другие проекты.
# Приложение поднимается в своих контейнерах, фронтенд слушает только 127.0.0.1:$PORT,
# а в общий /etc/caddy/Caddyfile добавляется блок для домена — SSL Caddy выпускает сам.
# Повторный запуск = обновление до свежего кода из GitHub. Другие проекты не затрагиваются.
set -euo pipefail

DOMAIN="opspacebank.ru"
REPO="https://github.com/AShevts5/OpSpaceBank.git"
APP="/opt/opspacebank"
SRC="$APP/src"
PORT=8082
CADDYFILE="/etc/caddy/Caddyfile"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Запустите от root: sudo bash deploy.sh"
command -v docker >/dev/null || die "Docker не найден."
systemctl is-active --quiet caddy || die "Системный Caddy не запущен — этот скрипт рассчитан на сервер с Caddy."

FREE_MB=$(df -Pm / | awk 'NR==2{print $4}')
echo "Свободно на диске: ${FREE_MB} МБ"
[ "$FREE_MB" -ge 1800 ] || die "Нужно минимум ~1,8 ГБ свободного места. Освободите место или увеличьте диск."

if ss -tln | grep -q "127.0.0.1:$PORT " && ! docker ps --format '{{.Names}}' | grep -q '^opspacebank-frontend'; then
  die "Порт $PORT уже занят другим приложением. Поменяйте PORT в начале скрипта."
fi

if ! swapon --show | grep -q /swapfile && [ "$FREE_MB" -ge 2800 ]; then
  say "Своп 1 ГБ на время сборки"
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile \
    || { warn "Своп создать не удалось — продолжаю без него."; rm -f /swapfile; }
fi

say "Код из GitHub"
mkdir -p "$APP"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q origin && git -C "$SRC" reset -q --hard origin/main
else
  git clone -q --depth 1 "$REPO" "$SRC"
fi
git -C "$SRC" log -1 --format='Коммит: %h %s'

if [ ! -f "$APP/.env" ]; then
  echo "DB_PASSWORD=$(openssl rand -hex 16)" > "$APP/.env"
  chmod 600 "$APP/.env"
fi

if [ ! -f "$APP/backend.env" ]; then
  say "Настройки бэкенда (можно нажать Enter и вписать позже в $APP/backend.env)"
  read -rp "Yandex ClientID: " YA_ID || true
  read -rp "Yandex Client secret: " YA_SECRET || true
  read -rp "Ключ AI (YandexGPT/OpenAI), Enter — без модели: " LLM_KEY || true
  LLM_PROVIDER=none
  if [ -n "${LLM_KEY:-}" ]; then LLM_PROVIDER=openai; fi
  cat > "$APP/backend.env" <<EOF
JWT_SECRET=$(openssl rand -hex 32)
REQUIRE_2FA=false
FRONTEND_URL=https://$DOMAIN
BACKEND_PUBLIC_URL=https://$DOMAIN
MOBILE_REDIRECT=ru.opspacebank.app://oauth
CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,capacitor://localhost,https://localhost
YANDEX_CLIENT_ID=${YA_ID:-}
YANDEX_CLIENT_SECRET=${YA_SECRET:-}
LLM_PROVIDER=$LLM_PROVIDER
LLM_API_KEY=${LLM_KEY:-}
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_FOLDER_ID=
EOF
  chmod 600 "$APP/backend.env"
fi

cat > "$APP/docker-compose.yml" <<EOF
name: opspacebank
services:
  db:
    image: postgres:16-alpine
    container_name: opspacebank-db
    environment:
      POSTGRES_USER: opspacebank
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: opspacebank
    volumes: [pgdata:/var/lib/postgresql/data]
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opspacebank"]
      interval: 5s
      retries: 20

  backend:
    build: ./src/backend
    container_name: opspacebank-backend
    env_file: ./backend.env
    environment:
      DATABASE_URL: postgresql+asyncpg://opspacebank:\${DB_PASSWORD}@db:5432/opspacebank
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped

  frontend:
    build:
      context: ./src/frontend
      dockerfile_inline: |
        FROM node:20-alpine AS build
        WORKDIR /app
        COPY package.json ./
        RUN sed -i -E 's/": "([0-9])/": "^\\1/' package.json \\
         && npm install --no-audit --no-fund \\
         && npm install --no-audit --no-fund workbox-window@^7 \\
         && npm cache clean --force
        COPY . .
        RUN npx vite build
        FROM nginx:1.27-alpine
        COPY nginx.conf /etc/nginx/conf.d/default.conf
        COPY --from=build /app/dist /usr/share/nginx/html
    container_name: opspacebank-frontend
    ports: ["127.0.0.1:$PORT:80"]
    depends_on: [backend]
    restart: unless-stopped

volumes:
  pgdata:
EOF

say "Сборка и запуск (первый раз 5–10 минут)"
cd "$APP"
docker compose up -d --build --remove-orphans
say "Чищу кеш сборки, чтобы не съедать место на диске"
docker builder prune -af >/dev/null || true
docker image prune -f >/dev/null || true
if swapon --show | grep -q /swapfile; then swapoff /swapfile && rm -f /swapfile; fi

say "Подключаю домен к Caddy"
if grep -q "$DOMAIN" "$CADDYFILE"; then
  echo "Блок $DOMAIN в $CADDYFILE уже есть."
else
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
  cat >> "$CADDYFILE" <<EOF

$DOMAIN, www.$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:$PORT
}
EOF
  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    LAST=$(ls -t "$CADDYFILE".bak-* | head -1)
    cp "$LAST" "$CADDYFILE"
    die "Caddyfile не прошёл проверку — вернул прежнюю версию, другие сайты не затронуты."
  fi
fi
systemctl reload caddy

say "Проверка"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 5 "https://$DOMAIN/api/v1/health"; then
    say "Готово: https://$DOMAIN работает, SSL выпущен"
    docker compose ps
    df -h / | tail -1
    exit 0
  fi
  sleep 5
done

warn "Сайт пока не ответил по HTTPS. Состояние и логи:"
docker compose ps
curl -sS -o /dev/null -w "Локально фронтенд: HTTP %{http_code}\n" "http://127.0.0.1:$PORT/" || true
docker compose logs --tail=25 backend
journalctl -u caddy --since "5 min ago" --no-pager | tail -15
exit 1
