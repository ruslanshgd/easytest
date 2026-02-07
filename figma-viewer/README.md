# FigmaTest Viewer

Веб-приложение, в котором респонденты проходят UX-тесты с прототипами Figma: открывают ссылку из плагина, вводят код из email, проходят блоки теста и смотрят прототип во встроенном Figma Embed.

## Требования

- Node.js 20.19+ или 22.12+
- npm 10+

## Установка и запуск

```bash
cd figma-viewer
npm install
npm run dev
```

Приложение откроется на http://localhost:5173 (или порт из вывода терминала).

## Переменные окружения

Создайте файл `.env` в корне `figma-viewer`:

| Переменная | Описание |
|------------|----------|
| `VITE_SUPABASE_URL` | URL проекта Supabase (например `https://xxxxx.supabase.co` или `https://api.ваш-домен.ru`) |
| `VITE_SUPABASE_ANON_KEY` | Anon-ключ из Supabase (Settings → API) |

Для production используйте `.env.production` с теми же переменными и пересоберите: `npm run build`.

## Figma OAuth (Embed)

Для аналитики кликов и переходов между экранами нужен Figma Embed (OAuth). В [Figma Developer Console](https://www.figma.com/developers/apps) создайте приложение и укажите в **Allowed origins** домен viewer (например `http://localhost:5173` и production URL). Client ID задаётся в коде: `figma-viewer/src/TestView.tsx` → константа `FIGMA_CLIENT_ID`.

## Документация

Полная установка (локально и на сервере), миграции БД и деплой: **[INSTALLATION_RU.md](../INSTALLATION_RU.md)** (или [INSTALLATION_EN.md](../INSTALLATION_EN.md)).
