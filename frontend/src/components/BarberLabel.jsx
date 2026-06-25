import React from 'react';
import { C } from '../pages/BarberDashboard';

export const Label = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.text2, marginBottom: 4 }}>
    {children}
  </div>
);

