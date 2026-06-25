import React from 'react';
import { useNavigate } from 'react-router-dom';
import { setBarberToken, setBarberProfileCache } from '../api/client';
import { useBarberTheme } from '../hooks/useTheme';

export const BarberProfileDropdown = ({ open, onClose, user, onEditShop }) => {
  const C = useBarberTheme();
  const navigate = useNavigate();
  if (!open) return null;
  const isOwner = user?.role === 'owner';
  const items = [
    { label: 'Edit Shop Details', icon: '💈', disabled: !isOwner },
    { label: 'Logout', icon: '🚪', danger: true },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0,
        background: C.white, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '6px', minWidth: 200, zIndex: 50,
        boxShadow: '0 4px 20px rgba(0,0,0,0.09)',
      }}>
        {items.map(it => (
          <button key={it.label}
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return;
              onClose();
              if (it.label === 'Logout') {
                setBarberToken(null);
                setBarberProfileCache(null);
                localStorage.removeItem('barber_user');
                navigate('/');
                return;
              }
              if (it.label === 'Edit Shop Details') onEditShop();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8,
              background: 'none', border: 'none', cursor: it.disabled ? 'not-allowed' : 'pointer',
              color: it.disabled ? C.text3 : (it.danger ? '#dc2626' : C.text),
              fontSize: 13, fontFamily: "'Poppins',sans-serif", textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = C.bg; }}
            onMouseLeave={e => { if (!it.disabled) e.currentTarget.style.background = 'none'; }}
          >
            <span>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.label === 'Edit Shop Details' && !isOwner && <span style={{ fontSize: 10, padding: '2px 6px', background: C.bg, borderRadius: 4, border: `1px solid ${C.border}` }}>Owner Only</span>}
          </button>
        ))}
      </div>
    </>
  );
};

