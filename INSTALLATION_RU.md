# Инструкция по установке и развертыванию

## Что это

Три инструмента для тестирования прототипов в Figma:
- **figma-plugin** — плагин для Figma, создает прототипы
- **figma-viewer** — веб-приложение, где респонденты тестируют прототипы
- **figma-analytics** — панель аналитики, показывает результаты тестов

---

## Часть 1: Установка на компьютер

### Windows

1. Скачайте Node.js: https://nodejs.org/
2. Установите, выбрав версию LTS
3. Откройте командную строку (Win + R, введите `cmd`)
4. Проверьте установку:
   ```bash
   node --version
   npm --version
   ```

### macOS

1. Скачайте Node.js: https://nodejs.org/
2. Установите, выбрав версию LTS
3. Откройте Терминал (через Spotlight: Cmd + Space, введите "Терминал")
4. Проверьте установку:
   ```bash
   node --version
   npm --version
   ```

---

## Часть 2: Локальная установка

### Шаг 1: Скачайте проект

Если проект в Git:
```bash
git clone [ссылка на репозиторий]
cd figmaTest
```

Если проект в архиве — распакуйте в папку.

### Шаг 2: Установите зависимости

Откройте терминал в папке проекта и выполните:

**Для figma-viewer:**
```bash
cd figma-viewer
npm install
```

**Для figma-analytics:**
```bash
cd figma-analytics
npm install
```

**Для figma-plugin:**
Плагин устанавливается через Figma Community, подробности в [Части 3](#часть-3-установка-плагина-в-figma).

### Шаг 3: Настройте Supabase

#### Вариант А: Supabase Cloud (быстро)

1. Зайдите на https://supabase.com
2. Создайте аккаунт
3. Создайте новый проект
4. Дождитесь создания (2–3 минуты)
5. Откройте Settings → API
6. Скопируйте:
   - **Project URL** (например: `https://xxxxx.supabase.co`)
   - **anon/public key** (длинная строка)

#### Вариант Б: Supabase Self-Hosted (на своем сервере)

**Требования:**
- Сервер с Docker (Ubuntu 20.04+ или аналог)
- Минимум 2 GB RAM
- 20 GB свободного места

**Установка:**

1. Подключитесь к серверу по SSH
2. Установите Docker и Docker Compose:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```
3. Скачайте Supabase:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   ```
4. Скопируйте файл настроек:
   ```bash
   cp .env.example .env
   ```
5. Откройте `.env` и настройте:
   - `POSTGRES_PASSWORD` — пароль для базы данных
   - `JWT_SECRET` — случайная строка (сгенерируйте: `openssl rand -base64 32`)
   - `ANON_KEY` — случайная строка (сгенерируйте: `openssl rand -base64 32`)
   - `SERVICE_ROLE_KEY` — случайная строка (сгенерируйте: `openssl rand -base64 32`)
6. Запустите:
   ```bash
   docker-compose up -d
   ```
7. Подождите 2–3 минуты, проверьте:
   ```bash
   docker-compose ps
   ```
8. Откройте в браузере: `http://ваш-ip:8000`
9. Создайте проект через веб-интерфейс
10. Получите URL и ключи в Settings → API

**Важно:** Для доступа извне настройте файрвол:
```bash
sudo ufw allow 8000/tcp
sudo ufw allow 5432/tcp
```

### Шаг 4: Создайте базу данных

В Supabase Dashboard:
1. Откройте SQL Editor
2. Создайте таблицы (если есть SQL-скрипт, выполните его)
3. Настройте RLS (Row Level Security) политики

### Шаг 5: Настройте Figma OAuth (Embed Kit 2.0)

Для работы аналитики кликов и отслеживания переходов между экранами:

1. Перейдите в [Figma Developer Console](https://www.figma.com/developers/apps)
2. Нажмите **Create new app**
3. Заполните форму:
   - **App name**: название вашего приложения (например, "ИзиТест Viewer")
   - **Website URL**: URL вашего viewer (например, `https://viewer.ваш-домен.ru`)
4. В разделе **Allowed origins** добавьте домены:
   - Для разработки: `http://localhost:5173`
   - Для продакшна: `https://viewer.ваш-домен.ru`
5. Сохраните и скопируйте **Client ID**
6. Откройте файл `figma-viewer/src/TestView.tsx` и обновите константу:
   ```typescript
   const FIGMA_CLIENT_ID = "ваш-client-id";
   ```

> **Важно:** Без настройки Figma OAuth события от embed (клики, переходы) не будут отслеживаться в аналитике.

### Шаг 6: Настройте переменные окружения

**Для figma-viewer:**

Создайте файл `.env` в папке `figma-viewer`:
```env
VITE_SUPABASE_URL=https://ваш-проект.supabase.co
VITE_SUPABASE_ANON_KEY=ваш-anon-ключ
```

**Для figma-analytics:**

Создайте файл `.env` в папке `figma-analytics`:
```env
VITE_SUPABASE_URL=https://ваш-проект.supabase.co
VITE_SUPABASE_ANON_KEY=ваш-anon-ключ
```

### Шаг 7: Запустите локально

**Запуск figma-viewer:**
```bash
cd figma-viewer
npm run dev
```
Откроется на http://localhost:5173

**Запуск figma-analytics:**
```bash
cd figma-analytics
npm run dev
```
Откроется на http://localhost:5174 (или другой порт, смотрите в терминале)

---

## Часть 3: Установка плагина в Figma

Плагин опубликован в Figma Community и устанавливается автоматически:

1. Откройте Figma Desktop или веб-версию
2. Перейдите по ссылке: [ИзиТест в Figma Community](https://www.figma.com/community/plugin/1587860401738140185)
3. Нажмите кнопку "Install" или "Установить"
4. Плагин появится в меню: **Plugins → ИзиТест**

### Первая настройка плагина

1. Запустите плагин: Plugins → Изи Тест
2. Заполните форму:
   - **Supabase URL** — URL вашего Supabase проекта
   - **Supabase Anon Key** — anon ключ из Supabase
   - **Viewer URL** — для локальной разработки: `http://localhost:5173`
   - **Analytics URL** — для локальной разработки: `http://localhost:5174`
   - **Figma Personal Access Token** — токен для доступа к Figma REST API (получить можно в Figma Settings → Account → Personal Access Tokens)
3. Нажмите "Сохранить настройки"

### Работа с прототипами и flows

**Создание прототипа в Figma:**
1. Создайте прототип с flows (starting points) в Figma
2. Для каждого flow определите финальный экран — добавьте `[final]` в название фрейма
3. Убедитесь, что у каждого flow есть свой финальный экран (они могут отличаться)

**Импорт прототипа в плагин:**
1. В Figma скопируйте Share ссылку (Share → Copy link)
2. Запустите плагин ИзиТест
3. Нажмите "Импортировать прототип"
4. Вставьте Share ссылку
5. Если в файле несколько flows, выберите нужный из выпадающего списка
6. Нажмите "Использовать выбранный flow"
7. Проверьте, что плагин определил правильные стартовый и финальный экраны

**Отправка на тест:**
1. Введите задание для респондента (до 250 символов)
2. Нажмите "Отправить на тест"
3. Скопируйте ссылку для респондентов
4. Респонденты откроют ссылку в браузере и пройдут тест

**Важно:**
- Каждый flow имеет свои экраны и свой финальный экран
- В аналитике отображаются только экраны выбранного flow
- При создании нескольких прототипов из одного файла с разными flows, каждый будет иметь свои экраны в аналитике

---

## Часть 4: Развертывание на своем домене

### Шаг 1: Выберите хостинг

**Варианты в РФ:**

1. **Reg.ru VPS**
   - Зайдите на https://www.reg.ru
   - Выберите VPS тариф (от 200₽/месяц)
   - Операционная система: Ubuntu 22.04

2. **Timeweb VPS**
   - Зайдите на https://timeweb.com
   - Выберите VPS тариф
   - Операционная система: Ubuntu 22.04

3. **Selectel VPS**
   - Зайдите на https://selectel.ru
   - Выберите VPS тариф
   - Операционная система: Ubuntu 22.04

### Шаг 2: Настройте сервер

1. Подключитесь по SSH:
   ```bash
   ssh root@ваш-ip-адрес
   ```

2. Обновите систему:
   ```bash
   apt update && apt upgrade -y
   ```

3. Установите Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   ```

4. Установите Nginx:
   ```bash
   apt install -y nginx
   ```

5. Установите PM2 (менеджер процессов):
   ```bash
   npm install -g pm2
   ```

### Шаг 3: Загрузите проект

1. Установите Git:
   ```bash
   apt install -y git
   ```

2. Клонируйте репозиторий или загрузите файлы:
   ```bash
   cd /var/www
   git clone [ссылка на репозиторий] figmaTest
   # или загрузите через SCP/SFTP
   ```

3. Установите зависимости:
   ```bash
   cd /var/www/figmaTest/figma-viewer
   npm install
   npm run build
   
   cd /var/www/figmaTest/figma-analytics
   npm install
   npm run build
   ```

### Шаг 4: Настройте переменные окружения на сервере

**Для figma-viewer:**
```bash
cd /var/www/figmaTest/figma-viewer
nano .env.production
```

Добавьте:
```env
VITE_SUPABASE_URL=https://ваш-supabase-url
VITE_SUPABASE_ANON_KEY=ваш-anon-ключ
```

**Для figma-analytics:**
```bash
cd /var/www/figmaTest/figma-analytics
nano .env.production
```

Добавьте:
```env
VITE_SUPABASE_URL=https://ваш-supabase-url
VITE_SUPABASE_ANON_KEY=ваш-anon-ключ
```

**Важно:** Пересоберите после изменения `.env`:
```bash
cd /var/www/figmaTest/figma-viewer && npm run build
cd /var/www/figmaTest/figma-analytics && npm run build
```

### Шаг 5: Настройте Nginx

Создайте конфигурацию для viewer:
```bash
nano /etc/nginx/sites-available/viewer
```

Добавьте:
```nginx
server {
    listen 80;
    server_name viewer.ваш-домен.ru;

    root /var/www/figmaTest/figma-viewer/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Создайте конфигурацию для analytics:
```bash
nano /etc/nginx/sites-available/analytics
```

Добавьте:
```nginx
server {
    listen 80;
    server_name analytics.ваш-домен.ru;

    root /var/www/figmaTest/figma-analytics/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Активируйте конфигурации:
```bash
ln -s /etc/nginx/sites-available/viewer /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/
```

Проверьте конфигурацию:
```bash
nginx -t
```

Перезапустите Nginx:
```bash
systemctl restart nginx
```

### Шаг 6: Настройте домен

1. Зайдите в панель управления доменом (reg.ru, timeweb и т.д.)
2. Добавьте A-записи:
   - `viewer.ваш-домен.ru` → IP вашего сервера
   - `analytics.ваш-домен.ru` → IP вашего сервера
3. Подождите 10–30 минут (пока DNS обновится)

### Шаг 7: Настройте SSL (HTTPS)

Установите Certbot:
```bash
apt install -y certbot python3-certbot-nginx
```

Получите сертификаты:
```bash
certbot --nginx -d viewer.ваш-домен.ru
certbot --nginx -d analytics.ваш-домен.ru
```

Certbot автоматически обновит конфигурацию Nginx.

### Шаг 8: Обновите настройки плагина

1. Откройте Figma
2. Запустите плагин
3. Нажмите "⚙️ Настройки"
4. Обновите:
   - **Viewer URL**: `https://viewer.ваш-домен.ru`
   - **Analytics URL**: `https://analytics.ваш-домен.ru`
5. Сохраните

---

## Часть 5: Supabase на своем сервере

Если хотите разместить Supabase на том же или отдельном сервере:

### Требования

- Сервер с 4+ GB RAM
- 50+ GB свободного места
- Ubuntu 20.04+ или аналог
- Docker и Docker Compose

### Установка

1. Подключитесь к серверу
2. Установите Docker (см. выше)
3. Скачайте Supabase:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   ```
4. Настройте `.env` (см. выше)
5. Запустите:
   ```bash
   docker-compose up -d
   ```
6. Проверьте статус:
   ```bash
   docker-compose ps
   ```
7. Откройте: `http://ваш-ip:8000`

### Настройка домена для Supabase

1. Настройте поддомен (например: `api.ваш-домен.ru`)
2. Настройте Nginx как reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name api.ваш-домен.ru;

       location / {
           proxy_pass http://localhost:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
3. Получите SSL сертификат:
   ```bash
   certbot --nginx -d api.ваш-домен.ru
   ```

### Обновите URL в проектах

В `.env` файлах замените URL на ваш:
```env
VITE_SUPABASE_URL=https://api.ваш-домен.ru
```

---

## Часть 6: Проверка работы

### Локально

1. Запустите viewer: `cd figma-viewer && npm run dev`
2. Запустите analytics: `cd figma-analytics && npm run dev`
3. Откройте Figma, запустите плагин
4. Создайте прототип и отправьте на тест
5. Откройте ссылку в браузере — должно работать

### На сервере

1. Откройте `https://viewer.ваш-домен.ru` — должна открыться страница
2. Откройте `https://analytics.ваш-домен.ru` — должна открыться аналитика
3. В Figma обновите настройки плагина на production URL
4. Создайте прототип и проверьте работу

---

## Частые проблемы

### Плагин не видит Supabase

- Проверьте, что URL и ключ правильные
- Проверьте, что Supabase запущен
- Проверьте CORS настройки в Supabase (должны быть разрешены все домены)

### Viewer не открывается

- Проверьте, что сервер запущен
- Проверьте Nginx конфигурацию: `nginx -t`
- Проверьте логи: `tail -f /var/log/nginx/error.log`

### Ошибки при сборке

- Убедитесь, что Node.js версии 18+
- Удалите `node_modules` и `package-lock.json`, затем `npm install`
- Проверьте, что все переменные окружения заполнены

### DNS не работает

- Подождите до 24 часов (обычно 10–30 минут)
- Проверьте A-записи в панели домена
- Используйте `nslookup viewer.ваш-домен.ru` для проверки

---

## Что дальше

- Настройте резервное копирование базы данных
- Настройте мониторинг сервера
- Настройте автоматическое обновление через CI/CD
- Добавьте аналитику использования

---

## Поддержка

Если что-то не работает:
1. Проверьте логи в терминале
2. Проверьте логи Nginx: `/var/log/nginx/error.log`
3. Проверьте статус сервисов: `systemctl status nginx`
4. Проверьте Docker контейнеры: `docker-compose ps`

