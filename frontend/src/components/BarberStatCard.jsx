import React, { useState } from 'react';
import { useBarberTheme } from '../hooks/useTheme';

export const StatCard = ({ title, value, trend }) => {
  const C = useBarberTheme();
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      background: C.white, borderRadius: 12, padding: '0.8rem 1rem',
      boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: `1px solid ${C.border}`,
      borderLeft: hov ? `4px solid ${C.teal}` : '4px solid transparent',
      transform: hov ? 'translateY(-2px)' : 'none',
      transition: 'all 0.2s', flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.text3, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.text3, marginTop: 4 }}>{trend}</div>
    </div>
  );
};

