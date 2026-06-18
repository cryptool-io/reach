import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // CSS-variable driven so the same classes work in light + dark.
        // Vars are "R G B" triplets (see app.css) → opacity modifiers like bg-brand/15 work.
        bg: {
          DEFAULT: 'rgb(var(--c-bg) / <alpha-value>)',
          elev: 'rgb(var(--c-bg-elev) / <alpha-value>)',
          card: 'rgb(var(--c-bg-card) / <alpha-value>)',
          border: 'rgb(var(--c-bg-border) / <alpha-value>)'
        },
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          mute: 'rgb(var(--c-ink-mute) / <alpha-value>)',
          dim: 'rgb(var(--c-ink-dim) / <alpha-value>)'
        },
        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          hi: 'rgb(var(--c-brand-hi) / <alpha-value>)'
        },
        accent: {
          warn: 'rgb(var(--c-warn) / <alpha-value>)',
          good: 'rgb(var(--c-good) / <alpha-value>)',
          bad: 'rgb(var(--c-bad) / <alpha-value>)',
          info: 'rgb(var(--c-info) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.4)'
      },
      borderRadius: {
        xl: '12px'
      }
    }
  }
} satisfies Config;
