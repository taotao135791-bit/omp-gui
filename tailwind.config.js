/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0f1115',
          800: '#1a1d24',
          700: '#232730',
          600: '#2e3440',
          500: '#3b4252'
        },
        brand: {
          DEFAULT: '#10a37f',
          dark: '#0d8c6d',
          light: '#19c59a'
        }
      }
    }
  },
  plugins: []
}
