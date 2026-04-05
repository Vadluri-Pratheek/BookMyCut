import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaScissors } from 'react-icons/fa6';
import '../App.css';

const ROLE_CARDS = [
  {
    id: 'customer',
    icon: <FaUser size={36} />,
    title: 'I am a Customer',
    subtitle: 'Book barber services easily',
    route: '/auth/customer',
    accentBg: 'linear-gradient(135deg, #0d9488, #0f766e)',
    accentLight: '#f0fdfa',
    accentBorder: '#99f6e4',
  },
  {
    id: 'barber',
    icon: <FaScissors size={36} />,
    title: 'I am a Barber',
    subtitle: 'Manage your shop and appointments',
    route: '/auth/barber',
    accentBg: 'linear-gradient(135deg, #f97316, #ea580c)',
    accentLight: '#fff7ed',
    accentBorder: '#fed7aa',
  },
];

const RoleSelectionPage = () => {
  const navigate = useNavigate();

  const handleSelect = (card) => {
    localStorage.setItem('bmc_role', card.id);
    navigate(card.route);
  };

  return (
    <div className="page-center" style={{ background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              marginBottom: '1rem',
            }}
          >
            <span
              style={{
                background: 'linear-gradient(135deg,#0d9488,#0f766e)',
                borderRadius: '12px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '1.3rem',
              }}
            >
              <FaScissors />
            </span>
            <span
              style={{
                fontSize: '1.9rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg,#0d9488,#0f766e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.03em',
              }}
            >
              BookMyCut
            </span>
          </div>
          <h1
            style={{
              fontSize: '1.55rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '0.5rem',
            }}
          >
            Welcome to BookMyCut
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.93rem' }}>
            Book your perfect haircut anytime, anywhere
          </p>
        </div>

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {ROLE_CARDS.map((card) => (
            <button
              key={card.id}
              onClick={() => handleSelect(card)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.25rem',
                padding: '1.5rem',
                background: '#fff',
                border: `2px solid ${card.accentBorder}`,
                borderRadius: '18px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.22s ease',
                boxShadow: 'var(--shadow-sm)',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                e.currentTarget.style.borderColor = card.id === 'customer' ? '#0d9488' : '#f97316';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                e.currentTarget.style.borderColor = card.accentBorder;
              }}
            >
              <div
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '16px',
                  background: card.accentBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                  boxShadow: card.id === 'customer'
                    ? '0 5px 18px rgba(13,148,136,.3)'
                    : '0 5px 18px rgba(249,115,22,.3)',
                }}
              >
                {card.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '1.08rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '0.25rem',
                  }}
                >
                  {card.title}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {card.subtitle}
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>→</span>
            </button>
          ))}
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginTop: '2rem',
          }}
        >
          &copy; {new Date().getFullYear()} BookMyCut · All rights reserved
        </p>
      </div>
    </div>
  );
};

export default RoleSelectionPage;
