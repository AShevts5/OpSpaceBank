/** Цвета — CSS-переменные из src/styles/index.css: так светлая и тёмная тема
 * переключаются одним атрибутом data-theme, а классы Tailwind остаются те же. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        sheet: 'var(--sheet)',
        'sheet-2': 'var(--sheet-2)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-soft': 'var(--accent-soft)',
        ok: 'var(--ok)',
        'ok-soft': 'var(--ok-soft)',
        miss: 'var(--miss)',
        'miss-soft': 'var(--miss-soft)',
        gold: 'var(--gold)',
        emerald: {
          950: '#03241A',
          900: '#063A2A',
          800: '#0A5139',
          700: '#0E6B4A',
          600: '#13875C',
          500: '#1FA672',
          400: '#3CC48C',
          300: '#7BDDB0',
          200: '#B4EDD1',
          100: '#DDF7EA',
          50: '#F0FBF5',
        },
      },
      fontFamily: {
        display: ['Onest', 'Golos Text', 'system-ui', 'sans-serif'],
        body: ['Golos Text', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { md: '10px', lg: '16px', xl: '22px', '2xl': '28px' },
      boxShadow: {
        soft: 'var(--shadow)',
        glow: '0 8px 22px rgba(31, 166, 114, .45)',
      },
      maxWidth: { page: '1360px' },
    },
  },
  plugins: [],
}
