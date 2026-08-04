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
        // omp.sh palette: deep plum-black ink + warm cream
        ink: {
          950: '#0f0a14',
          900: '#151020',
          850: '#1a1428',
          800: '#201a30',
          700: '#2b2340',
          600: '#3b3153'
        },
        cream: {
          DEFAULT: '#f5f0ea',
          dim: '#b3abc0',
          faint: '#6f6683'
        },
        accent: {
          DEFAULT: '#7dd3fc',
          bright: '#a5f3fc',
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
