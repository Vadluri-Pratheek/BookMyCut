import React from 'react';

export const Toast = ({ message, type }) => (
  <div style={{
    position: 'fixed', top: 20, right: 20, zIndex: 1000,
    padding: '0.75rem 1.2rem', borderRadius: 10, fontSize: 13, fontWeight: 500,
    background: type === 'success' ? '#fff1e5' : '#fee2e2',
    border: `1px solid ${type === 'success' ? '#f8c48d' : '#fca5a5'}`,
    color: type === 'success' ? '#c2410c' : '#991b1b',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 8,
    animation: 'slideIn 0.2s ease', fontFamily: "'Poppins',sans-serif",
  }}>{message}</div>
);

