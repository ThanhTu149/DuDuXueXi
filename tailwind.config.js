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
          // rgb() + <alpha-value> keeps opacity modifiers (bg-accent/90,
          // border-accent/20, …) alive; the triplet is themed in index.css.
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
        },
        'accent-2': {
          DEFAULT: 'rgb(var(--accent-2-rgb) / <alpha-value>)',
          hover: 'var(--accent-2-hover)',
          subtle: 'var(--accent-2-subtle)',
        },
        warm: {
          DEFAULT: 'var(--warm)',
          subtle: 'var(--warm-subtle)',
        },
        'accent-purple': {
          DEFAULT: 'var(--accent-purple)',
          subtle: 'var(--accent-purple-subtle)',
        },
        'accent-orange': {
          DEFAULT: 'var(--accent-orange)',
          subtle: 'var(--accent-orange-subtle)',
        },
        'accent-blue': {
          DEFAULT: 'var(--accent-blue)',
          subtle: 'var(--accent-blue-subtle)',
        },
        success: {
          DEFAULT: 'rgb(var(--success-rgb) / <alpha-value>)',
          subtle: 'var(--success-subtle)',
        },
        error: {
          DEFAULT: 'rgb(var(--error-rgb) / <alpha-value>)',
          subtle: 'var(--error-subtle)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning-rgb) / <alpha-value>)',
          subtle: 'var(--warning-subtle)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
        hanzi: ['var(--font-hanzi)'],
      },
      fontSize: {
        display: ['var(--text-display)', { lineHeight: 'var(--leading-display)', letterSpacing: '-0.02em' }],
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        focus: 'var(--shadow-focus)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        full: 'var(--radius-full)',
      },
      transitionTimingFunction: {
        soft: 'var(--ease-out-soft)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      minHeight: {
        tap: 'var(--tap-target)',
      },
    },
  },
  plugins: [],
};
