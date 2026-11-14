/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#0a0b10',
          panel: '#121520',
          border: '#23293e',
          neonCyan: '#00f0ff',
          neonPink: '#ff0055',
          neonGreen: '#00ff66',
          neonOrange: '#ffaa00',
        }
      },
      fontFamily: {
        game: ['"Orbitron"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
