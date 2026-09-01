/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        charcoal: '#3a3a38',
        stone: '#e8e6e0',
        linen: '#dedad0',
        warm: '#f5f4f0',
        cream: '#faf9f6',
        // 物理学習アプリ（ダークテーマ）
        vacuum: '#080a12',
        deep: '#0e111c',
        panel: '#151a2b',
        edge: '#252b45',
        qink: '#e7eaf6',
        qmute: '#96a0c2',
        quantum: '#7c8cff',
        photon: '#4fd1c5',
        plasma: '#f472b6',
        violetq: '#c084fc',
        amberq: '#fbbf24',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulse3: {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse3 1.4s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};
