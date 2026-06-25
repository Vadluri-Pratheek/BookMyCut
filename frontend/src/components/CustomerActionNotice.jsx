import React from 'react';
import { T } from '../pages/CustomerDashboard';

export const ActionNotice = ({ notice }) => {
  if (!notice?.message) {
    return null;
  }

  const isError = notice.type === 'error';
  return (
    <div style={{
      position: 'fixed',
      top: 18,
      right: 18,
      zIndex: 120,
      maxWidth: 360,
      padding: '0.8rem 1rem',
      borderRadius: 12,
      border: `1px solid ${isError ? '#fca5a5' : 'rgba(13,148,136,0.25)'}`,
      background: isError ? '#fef2f2' : 'rgba(13,148,136,0.08)',
      color: isError ? '#b91c1c' : T.gold,
      boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
      fontSize: 13,
      fontWeight: 600,
      fontFamily: "'Poppins',sans-serif",
    }}>
      {notice.message}
    </div>
  );
};

