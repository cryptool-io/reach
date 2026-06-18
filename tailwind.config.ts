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
        // Soft, layered shadows that read well on the light default and stay subtle on dark
        // (where borders carry separation). Untitled-UI-ish.
        card: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
        'card-hover': '0 8px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.04)',
        pop: '0 12px 28px -6px rgba(16,24,40,0.16), 0 4px 8px -2px rgba(16,24,40,0.08)',
        btn: '0 1px 2px rgba(16,24,40,0.06)',
        brand: '0 1px 2px rgba(16,24,40,0.10), 0 2px 6px -1px rgba(22,163,74,0.30)'
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px'
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-in-up': 'fade-in-up 0.18s ease-out'
      }
    }
  }
} satisfies Config;
