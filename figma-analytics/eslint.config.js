import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Запрещаем hex цвета в строках (в style={{}} или className)
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,6}$/]',
          message: 'Не используйте захардкоженные hex цвета. Используйте CSS переменные (var(--color-*)) или Tailwind классы.',
        },
        {
          // Запрещаем rgb/rgba в строках
          selector: 'Literal[value=/^rgba?\\(/]',
          message: 'Не используйте захардкоженные rgb/rgba цвета. Используйте CSS переменные или Tailwind классы.',
        },
        {
          // Запрещаем Tailwind arbitrary values с hex цветами
          selector: 'TemplateLiteral[quasis.0.value.raw=/bg-\\[#|text-\\[#|border-\\[#/]',
          message: 'Не используйте Tailwind arbitrary values с hex цветами (bg-[#...]). Используйте переменные через Tailwind классы.',
        },
      ],
    },
  },
  {
    // Исключения: файлы, где захардкоженные цвета допустимы
    files: ['src/index.css', 'src/lib/styleUtils.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])

