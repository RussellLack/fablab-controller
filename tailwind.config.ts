import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aligned to the live fablabdesign.com palette.
        // Sources:
        //   --deep-red-from-f       #391b10  → brand        (serif-heading colour on the marketing site)
        //   --fablab-bright-red     #ef4126  → accent       (urgency / binding cues in the controller)
        //   --old-lace              #e4e0cf  → brand-soft   (paired soft fill)
        //   page body bg in Webflow #efe8df  → bg           (warm cream — the parchment background)
        // `accent` is reserved for UI-urgency semantics (BINDING pills, "ready
        // to issue" etc.); `brand` is the deep-red signature used on brand
        // chips and headings.
        bg: '#efe8df',
        surface: '#ffffff',
        ink: { DEFAULT: '#1a1a1a', 2: '#5b5b5b', 3: '#8d8d8a' },
        line: { DEFAULT: '#e2e0d8', strong: '#c9c6bb' },
        brand: { DEFAULT: '#391b10', soft: '#e4e0cf' },
        accent: { DEFAULT: '#ef4126', soft: '#fde6dd' },
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
  plugins: [require('@tailwindcss/typography')]
};

export default config;
