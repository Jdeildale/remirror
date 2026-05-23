/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        // Dark, calm palette per spec — no red anywhere.
        bg: '#0f1115',
        surface: '#171a20',
        text: '#e6e8eb',
        muted: '#8a93a0',
        accent: '#5fb6c4', // calm teal for goal-aligned signals
        amber: '#d2a04a',
        gray: '#5a6270',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
