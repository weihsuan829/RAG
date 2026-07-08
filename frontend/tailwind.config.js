export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['Fira Code', 'monospace'],
        sans: ['Fira Sans', 'sans-serif'],
      },
      colors: {
        primary: {
          500: '#3B82F6',
          400: '#60A5FA',
        }
      }
    },
  },
  plugins: [],
}
