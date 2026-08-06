import type { Config } from 'tailwindcss';

/**
 * Deep Lagoon design tokens — mirrors mobile/src/theme (single brand across
 * surfaces). Semantic color names resolve to CSS variables defined in
 * globals.css, which flip automatically with prefers-color-scheme.
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        ink: 'var(--ink)',
        'ink-secondary': 'var(--ink-secondary)',
        'ink-muted': 'var(--ink-muted)',
        'ink-faint': 'var(--ink-faint)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-tint': 'var(--accent-tint)',
        'accent-line': 'var(--accent-line)',
        record: 'var(--record)',
        'record-bright': 'var(--record-bright)',
        'record-tint': 'var(--record-tint)',
        danger: 'var(--danger)',
        'danger-tint': 'var(--danger-tint)',
        'danger-line': 'var(--danger-line)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      borderRadius: {
        // Match the mobile radius scale (sm 10 / md 14 / lg 20 / xl 24)
        sm: '10px',
        md: '14px',
        lg: '20px',
        xl: '24px',
      },
      boxShadow: {
        level1: '0 1px 3px rgba(20, 28, 25, 0.05)',
        level2: '0 2px 8px rgba(20, 28, 25, 0.08)',
        level3: '0 6px 18px rgba(20, 28, 25, 0.14)',
      },
    },
  },
  plugins: [],
};

export default config;
