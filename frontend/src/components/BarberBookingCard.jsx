import React from 'react';
import { FaMapMarkerAlt } from 'react-icons/fa';
import { useBarberTheme } from '../hooks/useTheme';
import { openDirectionsFromCurrentLocation } from '../utils/navigation';

export const BookingCard = ({ booking }) => {
  const C = useBarberTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: booking.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
        {booking.customer[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{booking.customer}</span>
          {booking.verificationCode && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: C.teal, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.15em', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              PIN: {booking.verificationCode}
            </span>
          )}
          {booking.isHomeVisit && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#ec4899', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.05em' }}>
              🏠 Home Visit
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.text3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          {booking.service}
          {booking.isHomeVisit && booking.homeLocation && (
            <button
              onClick={() => openDirectionsFromCurrentLocation(booking.homeLocation)}
              style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <FaMapMarkerAlt /> View Location
            </button>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <span style={{ background: C.tealL, color: C.teal, fontWeight: 700, fontSize: 10, borderRadius: 20, padding: '2px 9px', border: `1px solid ${C.teal}33` }}>
          {booking.timeLabel}
        </span>
      </div>
    </div>
  );
};

