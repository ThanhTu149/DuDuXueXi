/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
        },
        'accent-2': {
          DEFAULT: 'var(--accent-2)',
          hover: 'var(--accent-2-hover)',
          subtle: 'var(--accent-2-subtle)',
        },
        warm: {
          DEFAULT: 'var(--warm)',
          subtle: 'var(--warm-subtle)',
        },
        success: {
          DEFAULT: 'var(--success)',
          subtle: 'var(--success-subtle)',
        },
        error: {
          DEFAULT: 'var(--error)',
          subtle: 'var(--error-subtle)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          subtle: 'var(--warning-subtle)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
        hanzi: ['var(--font-hanzi)'],
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
    },
  },
  plugins: [],
};
