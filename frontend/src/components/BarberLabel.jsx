import React from 'react';
import { useBarberTheme } from '../hooks/useTheme';

export const Label = ({ children }) => {
  const C = useBarberTheme();
  return (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.text2, marginBottom: 4 }}>
      {children}
    </div>
  );
};

