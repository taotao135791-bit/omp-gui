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
        // Neutral cool dark with clear layer separation
        ink: {
          950: '#0b0b10',
          900: '#101016',
          850: '#14141c',
          800: '#191922',
          700: '#22222e',
          600: '#2e2e3e'
        },
        cream: {
          DEFAULT: '#ececf1',
          dim: '#a0a0ae',
          faint: '#62626e'
        },
        accent: {
          DEFAULT: '#7dd3fc',
          bright: '#bae6fd',
          deep: '#38bdf8'
        }
      },
      fontFamily: {
        sans: [
          'Geist', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'
        ],
        mono: [
          'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas',
          'PingFang SC', 'Microsoft YaHei', 'monospace'
        ]
      }
    }
  },
  plugins: []
}
