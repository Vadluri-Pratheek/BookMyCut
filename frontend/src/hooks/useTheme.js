import { useState, useEffect } from 'react';

// Claude-style dark mode palette
export const LIGHT_THEME = {
  bg: '#f8f7f4',
  surface: '#ffffff',
  s2: '#f1f0ec',
  s3: '#e8e7e3',
  br: '#e5e4df',
  br2: '#d0cfc9',
  text: '#1a1915',
  text2: '#5a5852',
  text3: '#9b9890',
  gold: '#0d9488',
  green: '#5a9e6f',
  amber: '#c97c2e',
};

export const DARK_THEME = {
  bg: '#1e1e1c',
  surface: '#2a2a27',
  s2: '#252523',
  s3: '#313130',
  br: '#3d3d3a',
  br2: '#4a4a47',
  text: '#ede9e3',
  text2: '#b8b4ac',
  text3: '#7a7773',
  gold: '#14b8a6',
  green: '#6fbd85',
  amber: '#e09540',
};

export function useTheme() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDark ? DARK_THEME : LIGHT_THEME;
}

export function useBarberTheme() {
  const theme = useTheme();
  return {
    teal: '#ff7a00', tealD: '#ef6400', tealL: theme.s3,
    bg: theme.bg, white: theme.surface, border: theme.br,
    text: theme.text, text2: theme.text2, text3: theme.text3,
  };
}
