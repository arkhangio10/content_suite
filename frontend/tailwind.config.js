/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Editorial neutrals
        ink: '#1A1A1A',
        inksoft: '#444444',
        inkmute: '#888888',
        paper: '#FFFFFF',
        paperwarm: '#FAF6EE',
        hairline: '#E8E8E8',
        hairlinestrong: '#CCCCCC',

        // Alicorp brand accent (red)
        accent: '#E8001D',
        accentsoft: '#FFF0F0',

        // Semantic state colors
        good: '#2F6B3A',
        goodsoft: '#E1F0E4',
        bad: '#A82D1A',
        badsoft: '#FAE6E1',
        warn: '#B07B17',
        warnsoft: '#FBEFD3',

        // Role accent (approver_a is purple in V2_ROLE)
        violet: '#6D3CB7',
        violetsoft: '#F1EDFB',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        editorial: '-0.025em',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up-lg': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s ease-out forwards',
        'slide-in': 'slide-in 0.35s ease-out forwards',
        'slide-up-lg': 'slide-up-lg 0.55s ease-out forwards',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
