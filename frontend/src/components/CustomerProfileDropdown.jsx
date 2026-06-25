import React from 'react';
import { useNavigate } from 'react-router-dom';
import { setCustomerToken, setCustomerProfileCache } from '../api/client';
import { T } from '../pages/CustomerDashboard';

export const ProfileDropdown = ({ open, onClose, onEdit }) => {
  const navigate = useNavigate();
  if (!open) return null;
  const items = [
    { label: 'Edit Profile', icon: '👤' },
    { label: 'Logout', icon: '🚪', danger: true },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0,
        background: T.surface, border: `1px solid ${T.br2}`,
        borderRadius: 12, padding: '6px', minWidth: 180, zIndex: 50,
        boxShadow: '0 4px 20px rgba(0,0,0,0.09)',
      }}>
        {items.map(it => (
          <button key={it.label}
            onClick={() => {
              onClose();
              if (it.label === 'Logout') {
                setCustomerToken(null);
                setCustomerProfileCache(null);
                localStorage.removeItem('bookmycut_user');
                localStorage.removeItem('customer_user');
                navigate('/');
                return;
              }
              if (it.label === 'Edit Profile' && onEdit) onEdit();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: it.danger ? '#ef4444' : T.text, fontSize: 13,
              fontFamily: "'Poppins',sans-serif", textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.s2}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>{it.icon}</span> {it.label}
          </button>
        ))}
      </div>
    </>
  );
};

