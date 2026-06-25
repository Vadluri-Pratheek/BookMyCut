import React from 'react';
import { FaMapMarkerAlt, FaClock } from 'react-icons/fa';
import { FaScissors } from 'react-icons/fa6';
import { T, fmtTime, SHOP_CARD_MIN_HEIGHT, ONE_LINE_ELLIPSIS, TWO_LINE_CLAMP } from '../pages/CustomerDashboard';
import { Stars } from './CustomerStars';

export const ShopCard = ({ shop, onBook, user }) => {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.br}`,
      borderRadius: 16, padding: '1.25rem', display: 'flex',
      flexDirection: 'column', gap: 10, transition: 'border-color 0.2s',
      minHeight: SHOP_CARD_MIN_HEIGHT, height: '100%',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = T.gold + '55'}
      onMouseLeave={e => e.currentTarget.style.borderColor = T.br}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, minHeight: 104 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 17, color: T.text, fontWeight: 400, ...ONE_LINE_ELLIPSIS }} title={shop.name}>{shop.name}</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color: T.text3, fontSize: 12, marginTop: 3 }}>
            <FaMapMarkerAlt size={10} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ ...TWO_LINE_CLAMP }} title={shop.address}>{shop.address}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
            {shop.services.slice(0, 3).map(svc => (
              <span key={svc.id} style={{ fontSize: 10, background: T.s3, border: `1px solid ${T.br}`, borderRadius: 4, padding: '1px 6px', color: T.text2 }}>{svc.name}</span>
            ))}
            {shop.services.length > 3 && <span style={{ fontSize: 10, color: T.text3 }}>+{shop.services.length - 3} more</span>}
          </div>
        </div>
        <Stars rating={shop.rating} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text2 }}>
        <FaClock size={11} style={{ color: T.green }} />
        <span>Live availability appears after you choose your services</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.text3 }}>
        <FaScissors size={10} />
        {fmtTime(shop.open)} – {fmtTime(shop.close)} &nbsp;·&nbsp; {shop.services.length} services
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={() => onBook(shop)}
          style={{
            flex: 1, padding: '0.6rem', borderRadius: 8,
            background: `linear-gradient(135deg,${T.gold},#0f766e)`,
            color: '#fff', fontWeight: 700, fontSize: 13, border: 'none',
            cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Book Now
        </button>
        {/* VERIFIED: hasHomeService auto-tags correctly */}
        {(user?.gender || '').toLowerCase() === 'female' && shop.hasHomeService && (
          <button
            onClick={() => onBook({ ...shop, isHomeService: true })}
            style={{
              flex: 1, padding: '0.6rem', borderRadius: 8,
              background: T.surface, border: `1px solid ${T.gold}`,
              color: T.gold, fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(13,148,136,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = T.surface}
          >
            Home Service
          </button>
        )}
      </div>
    </div>
  );
};

