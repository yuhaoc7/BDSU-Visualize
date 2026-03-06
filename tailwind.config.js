/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#1e293b', // slate-800
        muted: '#f8fafc', // slate-50
        border: '#e2e8f0', // slate-200
        primary: {
          DEFAULT: '#1e3a8a', // navy blue
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#0f766e', // muted teal
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#ea580c', // burnt orange
          foreground: '#ffffff',
        },
        baseline: '#475569', // slate-600
        highlight: '#fef08a', // pale yellow for text highlight
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
