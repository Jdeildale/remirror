/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        // Coffee-tone palette — Phase 2a. Mirror of src/shared/palette.ts.
        bg: '#1a1816',
        'bg-deep': '#0d0b09',
        surface: '#312d28',
        text: '#faf7f0',
        muted: '#b8b1a4',
        quiet: '#8a7f70',
        accent: '#5dc4b0',
        purple: '#c89af0',
        green: '#bdd470',
        sand: '#e8b06d',
        unclassified: '#8a7f70',
        amber: '#e8b06d', // Phase 1 legacy alias (mapped to sand for backward compat)
        gray: '#8a7f70',  // Phase 1 legacy alias
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
