import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        barbie: {
          50: '#FFF0F7',
          100: '#FFE1EF',
          200: '#FFC2DF',
          300: '#FF94C6',
          400: '#FF5CA8',
          500: '#F5308F',
          600: '#E6318F',
          700: '#C01C72',
          800: '#9A1A5D',
          900: '#7A1A4C',
        },
        gold: {
          100: '#FBF3DC',
          200: '#F3E2AE',
          300: '#E8CC77',
          400: '#D9B14A',
          500: '#C9A227',
          600: '#A87900',
          700: '#8A6400',
        },
        ingreso: '#12894F',
        gasto: '#D92D20',
        alerta: '#E8730C',
        crema: '#FFF5FA',
        tinta: '#3D2438',
      },
      fontFamily: {
        display: ['Quicksand', 'Poppins', 'ui-rounded', 'system-ui', 'sans-serif'],
        body: ['Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 4px 24px -4px rgba(230, 49, 143, 0.25)',
        'glow-gold': '0 4px 24px -4px rgba(201, 162, 39, 0.35)',
        card: '0 2px 16px -2px rgba(122, 26, 76, 0.10)',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};

export default config;
