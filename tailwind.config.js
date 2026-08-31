/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        yt: {
          bg: '#0f0f12',
          surface: '#18181f',
          card: '#1e1f2b',
          cardHover: '#2a2b3d',
          border: 'rgba(255, 255, 255, 0.1)',
          red: '#ff0033',
          redGlow: 'rgba(255, 0, 51, 0.4)',
          text: '#f1f1f1',
          muted: '#aaaaaa',
          dim: '#717171',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'tv-focus': '0 0 0 3px #ffffff, 0 10px 30px rgba(0, 0, 0, 0.8)',
        'yt-red': '0 0 25px rgba(255, 0, 51, 0.5)',
      }
    },
  },
  plugins: [],
}
