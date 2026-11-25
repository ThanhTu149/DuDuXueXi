/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--bg-primary-rgb) / <alpha-value>)',
        surface: 'rgb(var(--bg-secondary-rgb) / <alpha-value>)',
        subtle: 'rgb(var(--bg-tertiary-rgb) / <alpha-value>)',
        bg: {
          primary: 'rgb(var(--bg-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary-rgb) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary-rgb) / <alpha-value>)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: {
          DEFAULT: 'rgb(var(--border-rgb) / <alpha-value>)',
          strong: 'rgb(var(--border-strong-rgb) / <alpha-value>)',
        },
        accent: {
          // rgb() + <alpha-value> keeps opacity modifiers (bg-accent/90,
          // border-accent/20, …) alive; the triplet is themed in index.css.
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          hover: 'var(--accent-hover)',
          subtle: 'rgb(var(--accent-subtle-rgb) / <alpha-value>)',
        },
        'accent-2': {
          DEFAULT: 'rgb(var(--accent-2-rgb) / <alpha-value>)',
          hover: 'var(--accent-2-hover)',
          subtle: 'rgb(var(--accent-2-subtle-rgb) / <alpha-value>)',
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
