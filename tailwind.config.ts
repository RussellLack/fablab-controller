import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Match the wireframe palette
        bg: '#f6f5f1',
        surface: '#ffffff',
        ink: { DEFAULT: '#1a1a1a', 2: '#5b5b5b', 3: '#8d8d8a' },
        line: { DEFAULT: '#e2e0d8', strong: '#c9c6bb' },
        accent: { DEFAULT: '#c2410c', soft: '#fef3e8' },
        ok: { DEFAULT: '#166534', soft: '#dcfce7' },
        warn: { DEFAULT: '#92400e', soft: '#fef3c7' },
        danger: { DEFAULT: '#991b1b', soft: '#fee2e2' },
        info: { DEFAULT: '#1e40af', soft: '#dbeafe' },
        purple: { DEFAULT: '#5b21b6', soft: '#ede9fe' }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: { xxs: '0.6875rem' },
      letterSpacing: { tighter: '-0.02em', wider: '0.06em' }
    }
  },
  plugins: []
};

export default config;
