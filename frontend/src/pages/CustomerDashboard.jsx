import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaStar, FaMapMarkerAlt, FaClock, FaArrowLeft, FaCheck, FaCrosshairs } from 'react-icons/fa';
import { FaScissors, FaUser, FaChevronDown, FaXmark, FaCalendarDays } from 'react-icons/fa6';
import BrandLogo from '../components/BrandLogo';
import {
  apiRequest,
  getCustomerProfileCache,
  getCustomerToken,
  setCustomerProfileCache,
  setCustomerToken,
} from '../api/client';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { getLocalDateStr, getLocalDateWithOffset, isTuesdayDateStr } from '../utils/date';
import { getCurrentBrowserLocation, normalizeLocation, resolveLocationDetails } from '../utils/location';
import { openDirectionsFromCurrentLocation } from '../utils/navigation';
import L from 'leaflet';
// Fix Leaflet default icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      void resolveLocationDetails({ lat, lng, source: 'map' }, {
        address: `Selected location (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      }).then((location) => {
        if (location) {
          onSelect(location);
        }
      });
    },
  });
  return null;
}

/* ─── Theme ─────────────────────────────────────────────────── */
const T = {
  bg: '#f1f5f9', surface: '#ffffff', s2: '#f8fafc', s3: '#f1f5f9',
  br: '#e2e8f0', br2: '#cbd5e1',
  text: '#0f172a', text2: '#475569', text3: '#94a3b8',
  gold: '#0d9488', green: '#5a9e6f', amber: '#c97c2e',
};
const SHOP_CARD_MIN_HEIGHT = 250;
const BOOKING_CARD_MIN_HEIGHT = 170;
const CUSTOMER_TIMELINE_OPEN = 7 * 60;
const CUSTOMER_TIMELINE_CLOSE = 23 * 60;
const ONE_LINE_ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const TWO_LINE_CLAMP = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

/* ─── Utilities ─────────────────────────────────────────────── */
const pct = (m, open, total) => `${((m - open) / total * 100).toFixed(3)}%`;
const pctW = (d, total) => `${(d / total * 100).toFixed(3)}%`;
const getNowMins = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const fmtTime = (mins) => {
  if (mins == null) return '--';
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
};
const getDateStr = (offset = 0) => getLocalDateStr(offset);
const getDayLabel = (offset) => {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const d = getLocalDateWithOffset(offset);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const DATES = [0, 1, 2, 3].map(o => ({ offset: o, str: getDateStr(o), label: getDayLabel(o) }));
const INITIAL_BOOKING_DATE = DATES.find((date) => !isTuesdayDateStr(date.str)) || DATES[0];
const CURRENT_CUSTOMER_BUFFER_SECONDS = 60;
const AUTO_CANCEL_BUFFER_SECONDS = 60;
const BOOKING_SYNC_STORAGE_KEY = 'bookmycut_booking_sync';
const BOOKING_SYNC_EVENT_NAME = 'bookmycut_booking_sync';
const BOOKING_CONFIRM_REDIRECT_MS = 800;

const getBookingStartDateTime = (booking) => {
  if (!booking?.dateIso || booking?.slotStartMinutes == null) return null;

  const [year, month, day] = booking.dateIso.split('-').map(Number);
  if (!year || !month || !day) return null;

  const startDateTime = new Date(year, month - 1, day);
  startDateTime.setHours(0, 0, 0, 0);
  startDateTime.setMinutes(Number(booking.slotStartMinutes));
  return startDateTime;
};

const getTimerRemainingSeconds = (booking, extraBufferSeconds = 0, referenceTime = Date.now()) => {
  const startDateTime = getBookingStartDateTime(booking);
  if (!startDateTime) return 0;

  const expiresAt = startDateTime.getTime() + ((CURRENT_CUSTOMER_BUFFER_SECONDS + extraBufferSeconds) * 1000);
  return Math.max(0, Math.ceil((expiresAt - referenceTime) / 1000));
};

const isBookingTimerActive = (booking, referenceTime = Date.now()) => {
  if (!booking || booking.status !== 'current' || booking.dateIso !== getDateStr(0)) {
    return false;
  }

  const now = new Date(referenceTime);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= booking.slotStartMinutes;
};

const getCustomerBookingTimerState = (booking, referenceTime = Date.now()) => {
  if (!isBookingTimerActive(booking, referenceTime)) {
    return null;
  }

  const checkInRemaining = getTimerRemainingSeconds(booking, 0, referenceTime);
  if (checkInRemaining > 0) {
    return {
      phase: 'current',
      label: `0:${String(checkInRemaining).padStart(2, '0')}`,
    };
  }

  const autoCancelRemaining = getTimerRemainingSeconds(booking, AUTO_CANCEL_BUFFER_SECONDS, referenceTime);
  if (autoCancelRemaining > 0) {
    return {
      phase: 'auto',
      label: `Auto-cancel in 0:${String(autoCancelRemaining).padStart(2, '0')}`,
    };
  }

  return {
    phase: 'expired',
    label: 'Auto-cancelling...',
  };
};

const emitBookingSync = (payload = {}) => {
  const detail = { ...payload, timestamp: Date.now() };
  try {
    localStorage.setItem(BOOKING_SYNC_STORAGE_KEY, JSON.stringify(detail));
  } catch (_) {
    /* ignore sync persistence issues */
  }
  window.dispatchEvent(new CustomEvent(BOOKING_SYNC_EVENT_NAME, { detail }));
};

const getPastBookingStatusLabel = (booking) => {
  if (booking.status !== 'cancelled') {
    return 'Completed';
  }

  return booking.cancelledBy === 'auto' ? 'Auto Cancelled' : 'Cancelled';
};

const formatServiceNames = (services = []) => services.map((service) => service.name).join(', ');
const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;

const normalizeUpiId = (value = '') => String(value).trim().toLowerCase();

const isValidUpiId = (value = '') => UPI_ID_REGEX.test(normalizeUpiId(value));

const buildUpiPaymentLink = ({ upiId, payeeName, amount, note }) => {
  const params = new URLSearchParams({
    pa: normalizeUpiId(upiId),
    pn: payeeName,
    am: Number(amount || 0).toFixed(2),
    cu: 'INR',
  });

  if (note) {
    params.set('tn', note);
  }

  return `upi://pay?${params.toString()}`;
};

const ActionNotice = ({ notice }) => {
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

const formatBookingDateLabel = (isoDate) => {
  if (!isoDate) return '';
  const today = getDateStr(0);
  const tom = getDateStr(1);
  if (isoDate === today) return 'Today';
  if (isoDate === tom) return 'Tomorrow';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const mapApiBookingToCustomerUi = (b) => {
  const shopName = typeof b.shopId === 'object' && b.shopId?.name ? b.shopId.name : 'Shop';
  const shopAddress =
    typeof b.shopId === 'object' && b.shopId?.location?.address ? b.shopId.location.address : '';
  const shopCoordinates =
    typeof b.shopId === 'object' && Array.isArray(b.shopId?.location?.coordinates)
      ? b.shopId.location.coordinates
      : [];
  const barberName = typeof b.barberId === 'object' && b.barberId?.name ? b.barberId.name : '';
  const verificationCode = b.verificationCode || null;
  const status =
    b.status === 'upcoming' ? 'current' :
      b.status === 'cancelled' ? 'cancelled' : 'completed';
  return {
    id: b._id,
    apiBookingId: b._id,
    shopName,
    shopAddress,
    barberName,
    service: b.serviceName || formatServiceNames(Array.isArray(b.selectedServices) ? b.selectedServices : []) || 'Service',
    slotTime: b.slotTimeStr,
    dateIso: b.date,
    date: formatBookingDateLabel(b.date),
    verificationCode,
    price: b.priceTotal,
    status,
    cancelledBy: b.cancelledBy || null,
    selectedServices: Array.isArray(b.selectedServices) ? b.selectedServices : [],
    slotStartMinutes: b.slotStartMinutes,
    slotEndMinutes: b.slotEndMinutes,
    isHomeVisit: b.bookingType === 'homevisit',
    shopLat: shopCoordinates[1],
    shopLng: shopCoordinates[0],
  };
};

/* ─── Stars ─────────────────────────────────────────────────── */
const Stars = ({ rating }) => (
  <span style={{ color: T.gold, fontSize: 12 }}>
    {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
    <span style={{ color: T.text2, marginLeft: 4, fontSize: 11 }}>{rating}</span>
  </span>
);

/* ─── Continuous Timeline ────────────────────────────────────── */
const ContinuousTimeline = ({ availableSlots, loading, onSlotSelect, selectedSlot, duration, openTime = 540, closeTime = 1260, date }) => {
  const OPEN = openTime;
  const CLOSE = closeTime;
  const TOTAL = CLOSE - OPEN;
  const isToday = date === getDateStr(0);
  const isClosedDay = isTuesdayDateStr(date);
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  if (loading) {
    return <div style={{ color: T.text3, fontSize: 13, padding: '1rem 0' }}>Loading available slots...</div>;
  }

  // availableSlots from backend is now an array of { start, end, color }
  const segments = availableSlots || [];

  const isSlotValid = (mins) => {
    if (isToday && mins < nowMins) return false;
    if (mins + duration > CLOSE) return false;
    return segments.some(s => s.color === 'GREEN' && mins >= s.start && mins < s.end);
  };

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ position: 'relative', height: 44, borderRadius: 8, background: '#e2e8f0', border: `1px solid ${T.br}`, overflow: 'hidden', cursor: isClosedDay ? 'not-allowed' : 'crosshair' }}
        onClick={(e) => {
          if (isClosedDay) {
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const p = x / rect.width;
          let clickedMins = Math.round(OPEN + p * TOTAL);

          if (clickedMins < OPEN) clickedMins = OPEN;
          if (clickedMins > CLOSE - duration) clickedMins = CLOSE - duration;

          const clickedSeg = segments.find(s => clickedMins >= s.start && clickedMins < s.end);

          if (!clickedSeg || clickedSeg.color !== 'GREEN') {
            return; // Grey block does nothing
          }

          if (isToday && clickedMins < nowMins) {
            return;
          }

          if (isSlotValid(clickedMins)) {
            onSlotSelect(clickedMins);
          }
        }}
      >
        {/* Segments — green for available, grey for booked */}
        {segments.map((seg, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, height: '100%',
            left: pct(seg.start, OPEN, TOTAL), width: pctW(seg.end - seg.start, TOTAL),
            background: seg.color === 'GREEN'
              ? 'rgba(90,158,111,0.55)'
              : 'rgba(100,116,139,0.35)',
            borderLeft: seg.color === 'GREEN'
              ? '1px solid rgba(90,158,111,0.6)'
              : '1px solid rgba(100,116,139,0.4)',
            borderRight: seg.color === 'GREEN'
              ? '1px solid rgba(90,158,111,0.6)'
              : '1px solid rgba(100,116,139,0.4)',
          }} />
        ))}

        {/* Past time greyed out overlay */}
        {isToday && !isClosedDay && nowMins > OPEN && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: pctW(Math.min(nowMins, CLOSE) - OPEN, TOTAL),
            background: 'rgba(71, 85, 105, 0.55)',
            backdropFilter: 'grayscale(100%)',
            borderRight: `2px dashed ${T.text3}`,
            zIndex: 10,
            pointerEvents: 'none'
          }} />
        )}

        {isClosedDay && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(71, 85, 105, 0.72)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}>
            Closed On Tuesday
          </div>
        )}

        {/* Selected slot indicator */}
        {selectedSlot !== null && !isClosedDay && (
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: pct(selectedSlot, OPEN, TOTAL), width: pctW(duration, TOTAL),
            background: T.gold,
            border: '2px solid #fff',
            zIndex: 20,
            boxShadow: '0 0 10px rgba(0,0,0,0.2)'
          }}>
            <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', background: T.gold, color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 700 }}>
              {fmtTime(selectedSlot)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: T.text3 }}>
        <span>{fmtTime(OPEN)}</span>
        <span>{fmtTime(OPEN + TOTAL / 2)}</span>
        <span>{fmtTime(CLOSE)}</span>
      </div>

      {isClosedDay && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>
          This shop is closed every Tuesday.
        </div>
      )}

      {/* Fine-tune Minute Slider */}
      {selectedSlot !== null && !isClosedDay && (
        <div style={{ marginTop: '1.5rem', background: T.s2, padding: '1rem', borderRadius: 12, border: `1px solid ${T.br}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>Fine-tune Start Time (Minutes)</label>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.gold }}>{fmtTime(selectedSlot)}</span>
          </div>
          <input
            type="range"
            min={OPEN}
            max={CLOSE - duration}
            step={1}
            value={selectedSlot}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (isSlotValid(val)) {
                onSlotSelect(val);
              } else {
                // Snap to current value's closest valid GREEN minute
                let closest = val;
                let minDiff = Infinity;
                segments.forEach(s => {
                  if (s.color !== 'GREEN') return;
                  if (val < s.start) {
                    if (s.start - val < minDiff) { minDiff = s.start - val; closest = s.start; }
                  } else if (val >= s.end) {
                    // Maximum valid start in this block is s.end - 1
                    // Actually, if a duration is fixed, max start is just before block end. Wait, s.end is the boundary of valid START times!
                    // Yes, s.end is actually `lastT + 1`, meaning the highest slot start time is `s.end - 1`.
                    if (val - (s.end - 1) < minDiff) { minDiff = val - (s.end - 1); closest = s.end - 1; }
                  }
                });

                // Extra protection against past slots today
                if (isToday && closest < nowMins && closest !== val) {
                  closest = Math.max(closest, nowMins);
                }

                if (isSlotValid(closest)) onSlotSelect(closest);
              }
            }}
            style={{ width: '100%', accentColor: T.gold, cursor: 'pointer' }}
          />
          <p style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>
            Slider only snaps to valid free segments calculated by the shop algorithm.
          </p>
        </div>
      )}
    </div>
  );
};

/* ─── Shop Card (Dashboard) ──────────────────────────────────── */
const ShopCard = ({ shop, onBook, user }) => {
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

/* ─── Profile Dropdown ────────────────────────────────────────── */
const ProfileDropdown = ({ open, onClose, onEdit }) => {
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

/* ─── Dashboard Page ─────────────────────────────────────────── */
const sortCustomerBookings = (bookings = []) => (
  [...bookings].sort((a, b) => {
    if (a.dateIso !== b.dateIso) {
      return String(b.dateIso || '').localeCompare(String(a.dateIso || ''));
    }

    return Number(b.slotStartMinutes || 0) - Number(a.slotStartMinutes || 0);
  })
);

const DashboardPage = ({ onBook, refreshKey = 0, recentBooking = null }) => {
  const cachedCustomerProfile = getCustomerProfileCache();
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [myBookings, setMyBookings] = useState([]);
  const [isWideDashboardLayout, setIsWideDashboardLayout] = useState(() => window.innerWidth >= 1120);

  // Dynamic User Profile — fetched from backend API on mount
  const [user, setUser] = useState({
    name: cachedCustomerProfile?.name || '',
    phone: cachedCustomerProfile?.phone || '',
    email: cachedCustomerProfile?.email || '',
    gender: cachedCustomerProfile?.gender || '',
    address: cachedCustomerProfile?.address || '',
    city: cachedCustomerProfile?.city || '',
    state: cachedCustomerProfile?.state || '',
    homeLocation: normalizeLocation(cachedCustomerProfile?.homeLocation) || null,
  });
  const [userLoading, setUserLoading] = useState(!cachedCustomerProfile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editForm, setEditForm] = useState(user);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [bookingActionNotice, setBookingActionNotice] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const bookingsMountedRef = useRef(true);
  const autoCancelRefreshKeyRef = useRef('');
  const bookingsSignatureRef = useRef('');
  const shopsFetchKeyRef = useRef('');
  const shopsSignatureRef = useRef('');
  const hasLoadedShopsRef = useRef(false);

  // Fetch user profile from the database via /auth/customer/me
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      const token = getCustomerToken();
      if (!token) { setUserLoading(false); return; }
      try {
        const res = await apiRequest('/auth/customer/me', { method: 'GET', auth: 'customer' });
        if (!cancelled && res?.data) {
          const nextUser = {
            name: res.data.name || '',
            email: res.data.email || '',
            phone: res.data.phone || '',
            gender: res.data.gender || '',
            city: res.data.city || '',
            state: res.data.state || '',
            address: res.data.address || '',
            homeLocation: normalizeLocation(res.data.homeLocation) || null,
          };
          setUser(nextUser);
          setCustomerProfileCache(nextUser);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        // If token is invalid/expired, redirect to login
        if (err.status === 401) {
          setCustomerToken(null);
          setCustomerProfileCache(null);
          window.location.href = '/auth/customer';
          return;
        }
      } finally {
        if (!cancelled) setUserLoading(false);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bookingsMountedRef.current = true;

    return () => {
      bookingsMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsWideDashboardLayout(window.innerWidth >= 1120);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const [shops, setShops] = useState([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Get current location
  const getCurrentLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const location = await getCurrentBrowserLocation();
      setCurrentLocation(location);
      setEditForm((prev) => ({
        ...prev,
        homeLocation: location,
        address: location.address || prev.address,
        city: location.city || prev.city,
        state: location.state || prev.state,
      }));
    } catch (error) {
      console.error('Error getting location:', error);
      alert(error.message || 'Unable to get your current location. Please enable location services.');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void getCurrentBrowserLocation({ resolveAddress: false })
      .then((location) => {
        if (!cancelled) {
          setUserLocation(normalizeLocation(location));
        }
      })
      .catch(() => { });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const mapShopCards = (shopRows = []) => shopRows.map((s) => {
      const city = s.location?.city || '';
      const state = s.location?.state || '';
      const displayAddress = city && state ? `${city}, ${state}` : (s.location?.address || 'No address');

      return {
        id: s._id,
        name: s.name,
        address: displayAddress,
        lat: s.location?.coordinates[1],
        lng: s.location?.coordinates[0],
        rating: s.rating || 0,
        open: s.openTime || 540,
        close: s.closeTime || 1260,
        services: (s.services || []).map((svc, idx) => ({
          ...svc,
          id: svc._id || idx,
          duration: svc.durationMinutes
        })),
        hasHomeService: s.hasHomeService,
        shopCode: s.shopCode
      };
    });

    const requestShops = async (params) => {
      const res = await apiRequest(`/shops/nearby?${params.toString()}`, {
        method: 'GET',
        auth: 'customer',
      });

      return res?.success ? (res.data || []) : [];
    };

    const fetchShops = async () => {
      if (userLoading) return;

      try {
        const token = getCustomerToken();
        let jwtGender = '';
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.gender) jwtGender = payload.gender;
          } catch (e) { }
        }

        const gender = user.gender || jwtGender || 'Male';
        const savedHomeLocation = normalizeLocation(user.homeLocation);
        const searchLocation = savedHomeLocation || userLocation || null;
        const fetchKey = JSON.stringify({
          gender,
          city: user.city || '',
          state: user.state || '',
          lat: searchLocation?.lat ?? null,
          lng: searchLocation?.lng ?? null,
        });

        if (fetchKey === shopsFetchKeyRef.current && hasLoadedShopsRef.current) {
          return;
        }

        setLoadingShops(!hasLoadedShopsRef.current);
        const fallbackParams = new URLSearchParams({ gender });
        if (user.city) {
          fallbackParams.set('city', user.city);
        } else if (user.state) {
          fallbackParams.set('state', user.state);
        }

        let shopRows = [];

        if (searchLocation?.lng != null && searchLocation?.lat != null) {
          const nearbyParams = new URLSearchParams({ gender });
          nearbyParams.set('lng', String(searchLocation.lng));
          nearbyParams.set('lat', String(searchLocation.lat));
          shopRows = await requestShops(nearbyParams);

          if (shopRows.length === 0 && (user.city || user.state)) {
            shopRows = await requestShops(fallbackParams);
          }
        } else if (user.city || user.state) {
          shopRows = await requestShops(fallbackParams);
        } else {
          if (!cancelled) {
            const nextSignature = '[]';
            if (shopsSignatureRef.current !== nextSignature) {
              shopsSignatureRef.current = nextSignature;
              setShops([]);
            }
            shopsFetchKeyRef.current = fetchKey;
            hasLoadedShopsRef.current = true;
          }
          return;
        }

        if (!cancelled) {
          const mappedShops = mapShopCards(shopRows);
          const nextSignature = JSON.stringify(
            mappedShops.map((shop) => ({
              id: shop.id,
              name: shop.name,
              address: shop.address,
              rating: shop.rating,
              open: shop.open,
              close: shop.close,
              shopCode: shop.shopCode,
              hasHomeService: shop.hasHomeService,
              services: shop.services.map((service) => ({
                id: service.id,
                name: service.name,
                duration: service.duration,
                price: service.price,
              })),
            }))
          );

          if (shopsSignatureRef.current !== nextSignature) {
            shopsSignatureRef.current = nextSignature;
            setShops(mappedShops);
          }
          shopsFetchKeyRef.current = fetchKey;
          hasLoadedShopsRef.current = true;
        }
      } catch (err) {
        console.error('Failed to fetch shops:', err);
      } finally {
        if (!cancelled) {
          setLoadingShops(false);
        }
      }
    };

    fetchShops();

    return () => {
      cancelled = true;
    };
  }, [user.gender, user.homeLocation?.lat, user.homeLocation?.lng, userLocation?.lat, userLocation?.lng, user.city, user.state, userLoading]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const normalizedHomeLocation = normalizeLocation(editForm.homeLocation);
      const res = await apiRequest('/customers/profile', {
        method: 'PUT',
        auth: 'customer',
        body: {
          ...editForm,
          address: normalizedHomeLocation?.address || editForm.address || '',
          city: normalizedHomeLocation?.city || editForm.city || '',
          state: normalizedHomeLocation?.state || editForm.state || '',
          homeLocation: normalizedHomeLocation,
        },
      });
      if (res.success && res.data) {
        // Update user state with new data
        const nextUser = {
          ...res.data,
          homeLocation: normalizeLocation(res.data.homeLocation) || null,
        };
        setUser(nextUser);
        setCustomerProfileCache(nextUser);

        // If email was changed, update the token and show message
        if (editForm.email !== user.email) {
          alert('Email updated successfully! You can now login with your new email address.');
          // Note: The user will need to re-login with the new email next time
        }

        setIsEditingProfile(false);
      }
    } catch (err) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const loadMyBookings = useCallback(async () => {
    const token = getCustomerToken();
    if (!token) {
      if (bookingsMountedRef.current) {
        bookingsSignatureRef.current = '';
        setMyBookings([]);
      }
      return;
    }

    try {
      const res = await apiRequest('/bookings/my', { method: 'GET', auth: 'customer' });
      if (!bookingsMountedRef.current || !res?.data) return;
      const mapped = sortCustomerBookings(res.data.map(mapApiBookingToCustomerUi));
      const nextSignature = JSON.stringify(
        mapped.map((booking) => ({
          id: booking.id,
          status: booking.status,
          cancelledBy: booking.cancelledBy,
          slotTime: booking.slotTime,
          dateIso: booking.dateIso,
          price: booking.price,
          verificationCode: booking.verificationCode,
          service: booking.service,
        }))
      );
      if (bookingsSignatureRef.current !== nextSignature) {
        bookingsSignatureRef.current = nextSignature;
        setMyBookings(mapped);
      }
    } catch (error) {
      console.error('Failed to load customer bookings:', error);
      if (bookingsMountedRef.current && !bookingsSignatureRef.current) {
        setMyBookings([]);
      }
    }
  }, []);

  useEffect(() => {
    const handleBookingSyncEvent = () => {
      void loadMyBookings();
    };

    const handleBookingSyncStorage = (event) => {
      if (event.key === BOOKING_SYNC_STORAGE_KEY && event.newValue) {
        void loadMyBookings();
      }
    };

    loadMyBookings();
    window.addEventListener('bookmycut_bookings_refresh', loadMyBookings);
    window.addEventListener(BOOKING_SYNC_EVENT_NAME, handleBookingSyncEvent);
    window.addEventListener('storage', handleBookingSyncStorage);
    const refreshInterval = setInterval(loadMyBookings, 30000);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('bookmycut_bookings_refresh', loadMyBookings);
      window.removeEventListener(BOOKING_SYNC_EVENT_NAME, handleBookingSyncEvent);
      window.removeEventListener('storage', handleBookingSyncStorage);
    };
  }, [loadMyBookings, refreshKey]);

  useEffect(() => {
    if (!recentBooking) return;

    const mappedBooking = mapApiBookingToCustomerUi(recentBooking);
    setMyBookings((prev) => sortCustomerBookings([
      mappedBooking,
      ...prev.filter((booking) => booking.apiBookingId !== mappedBooking.apiBookingId),
    ]));
  }, [recentBooking]);

  useEffect(() => {
    const tickInterval = setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => clearInterval(tickInterval);
  }, []);

  useEffect(() => {
    if (!bookingActionNotice?.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setBookingActionNotice(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [bookingActionNotice]);

  useEffect(() => {
    const expiredIds = myBookings
      .filter((booking) => getCustomerBookingTimerState(booking, clockTick)?.phase === 'expired')
      .map((booking) => booking.id)
      .sort()
      .join(',');

    if (!expiredIds) {
      autoCancelRefreshKeyRef.current = '';
      return;
    }

    if (expiredIds !== autoCancelRefreshKeyRef.current) {
      autoCancelRefreshKeyRef.current = expiredIds;
      loadMyBookings();
    }
  }, [clockTick, loadMyBookings, myBookings]);

  const handleCancelBooking = async (id) => {
    const row = myBookings.find((b) => b.id === id);
    const apiId = row?.apiBookingId || (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id) ? id : null);
    setCancellingBookingId(id);
    if (getCustomerToken() && apiId && row?.status === 'current') {
      try {
        await apiRequest(`/bookings/${apiId}/cancel`, {
          method: 'PUT',
          auth: 'customer',
          body: {},
        });
      } catch (e) {
        setCancellingBookingId(null);
        setBookingActionNotice({ type: 'error', message: e.message || 'Could not cancel booking' });
        return;
      }
    }
    setMyBookings((prev) => prev.map((b) => (
      b.id === id ? { ...b, status: 'cancelled', cancelledBy: 'customer' } : b
    )));
    if (row) {
      emitBookingSync({ type: 'cancelled', bookingId: apiId || row.id, dateIso: row.dateIso });
    }
    setCancellingBookingId(null);
    void loadMyBookings();
  };

  const handleNavigateToShop = (booking) => {
    openDirectionsFromCurrentLocation({
      lat: booking.shopLat,
      lng: booking.shopLng,
      address: booking.shopAddress || booking.shopName,
    });
  };

  const currentBookingsList = myBookings.filter(b => b.status === 'current');
  const pastBookingsList = myBookings.filter(b => b.status !== 'current');
  const editHomeLocation = normalizeLocation(editForm.homeLocation);
  const editHomeMapCenter = editHomeLocation
    ? [editHomeLocation.lat, editHomeLocation.lng]
    : [12.9716, 77.5946];

  const filtered = shops.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.address.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });
  const defaultCustomerLocation = user.homeLocation || userLocation || null;
  const handleShopBooking = (shop) => onBook({
    ...shop,
    defaultCustomerLocation,
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'Poppins',sans-serif" }}>
      <ActionNotice notice={bookingActionNotice} />
      {/* Header */}
      <header style={{
        background: T.surface, borderBottom: `1px solid ${T.br}`,
        position: 'sticky', top: 0, zIndex: 30, padding: '0 1.5rem',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Logo */}
          <BrandLogo
            size={34}
            textStyle={{
              fontFamily: "'Poppins',sans-serif",
              fontSize: 20,
              color: T.gold,
              letterSpacing: '-0.02em',
            }}
            containerStyle={{ flexShrink: 0 }}
          />

          {/* Search */}
          <div style={{ flex: 1, position: 'relative', maxWidth: 440, margin: '0 auto' }}>
            <FaSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.text3, fontSize: 13 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by shop name or location…"
              style={{
                width: '100%', padding: '0.55rem 1rem 0.55rem 2.2rem',
                background: T.s2, border: `1px solid ${T.br}`,
                borderRadius: 50, color: T.text, fontSize: 13, outline: 'none',
                fontFamily: "'Poppins',sans-serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = T.gold + '88'}
              onBlur={e => e.target.style.borderColor = T.br}
            />
          </div>

          {/* Profile */}
          <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: T.text2, fontWeight: 400 }}>Welcome, <strong style={{ color: T.text, fontWeight: 600 }}>{(user.name || 'User').split(' ')[0]}</strong></span>
            <button
              onClick={() => setProfileOpen(p => !p)}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: `linear-gradient(135deg,${T.gold},#0f766e)`,
                border: 'none', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#fff',
                fontSize: 14, fontWeight: 700, fontFamily: "'Poppins',sans-serif"
              }}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : <FaUser size={15} />}
            </button>
            <ProfileDropdown
              open={profileOpen}
              onClose={() => setProfileOpen(false)}
              onEdit={() => {
                const normalizedHomeLocation = normalizeLocation(user.homeLocation) || null;
                setEditForm({
                  ...user,
                  homeLocation: normalizedHomeLocation,
                  address: normalizedHomeLocation?.address || user.address || '',
                  city: normalizedHomeLocation?.city || user.city || '',
                  state: normalizedHomeLocation?.state || user.state || '',
                });
                setIsEditingProfile(true);
              }}
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '2rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: isWideDashboardLayout ? 'minmax(0, 1fr) 380px' : '1fr',
        gap: '2rem',
        alignItems: 'flex-start',
      }}>

        {/* Left Section: Shops */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 28, color: T.text, fontWeight: 400 }}>
                Find Your Perfect Barber
              </h1>
              <p style={{ color: T.text2, fontSize: 14, marginTop: 4 }}>
                {filtered.length} shop{filtered.length !== 1 ? 's' : ''} available near you
              </p>
              {userLocation && (
                <p style={{ color: T.text3, fontSize: 12, marginTop: 6 }}>
                  Using your current location for nearby results.
                </p>
              )}
            </div>
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'map' : 'grid')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.25rem',
                background: viewMode === 'grid' ? T.s2 : `rgba(13,148,136,0.1)`,
                color: viewMode === 'grid' ? T.text2 : T.gold,
                border: `1px solid ${viewMode === 'grid' ? T.br : 'rgba(13,148,136,0.3)'}`,
                borderRadius: 8, cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
                fontWeight: 600, fontSize: 13, transition: 'all 0.2s', alignSelf: 'center'
              }}
            >
              {viewMode === 'grid' ? <FaMapMarkerAlt /> : <FaCheck />}
              {viewMode === 'grid' ? 'View in Map' : 'Grid View'}
            </button>
          </div>

          {loadingShops ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: T.text3 }}>
              Loading shops...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: T.text3 }}>
              No shops found for "<span style={{ color: T.text2 }}>{search}</span>"
            </div>
          ) : viewMode === 'map' ? (
            <div style={{ height: 600, width: '100%', borderRadius: 16, overflow: 'hidden', border: `1px solid ${T.br}`, position: 'relative', zIndex: 10 }}>
              <MapContainer
                center={
                  userLocation
                    ? [userLocation.lat, userLocation.lng]
                    : (filtered[0]?.lat && filtered[0]?.lng ? [filtered[0].lat, filtered[0].lng] : [12.9716, 77.5946])
                }
                zoom={11}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                {userLocation && (
                  <Marker position={[userLocation.lat, userLocation.lng]}>
                    <Popup>Your current location</Popup>
                  </Marker>
                )}
                {filtered.map(shop => shop.lat && shop.lng && (
                  <Marker key={shop.id} position={[shop.lat, shop.lng]}>
                    <Popup>
                      <div style={{ textAlign: 'center', fontFamily: "'Poppins',sans-serif", minWidth: 160 }}>
                        <strong style={{ color: T.text, fontSize: 13, display: 'block', marginBottom: 4, fontWeight: 700 }}>{shop.name}</strong>
                        <div style={{ color: T.text3, fontSize: 11, marginBottom: 8 }}>{shop.address}</div>
                        <button
                          onClick={() => handleShopBooking(shop)}
                          style={{ width: '100%', padding: '6px', background: `linear-gradient(135deg,${T.gold},#0f766e)`, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins',sans-serif", fontSize: 12 }}
                        >
                          Book Now
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isWideDashboardLayout ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
            }}>
              {filtered.map(shop => <ShopCard key={shop.id} shop={shop} onBook={handleShopBooking} user={user} />)}
            </div>
          )}
        </div>

        {/* Right Section: My Bookings */}
        <div style={{
          width: '100%',
          maxWidth: isWideDashboardLayout ? 380 : 'none',
          justifySelf: isWideDashboardLayout ? 'end' : 'stretch',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}>

          {/* Current Bookings */}
          <section style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.br}`, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              📅 Current Bookings
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {currentBookingsList.length === 0 ? (
                <div style={{ color: T.text3, fontSize: 13, textAlign: 'center', padding: '1rem' }}>No current bookings.</div>
              ) : (
                currentBookingsList.map(b => (
                  <div key={b.id} style={{ border: `1px solid ${T.br}`, borderRadius: 14, padding: '1rem', background: T.surface, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', minHeight: BOOKING_CARD_MIN_HEIGHT, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: T.text, fontSize: 15, ...ONE_LINE_ELLIPSIS }} title={b.shopName}>{b.shopName}</div>
                        <div style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                          <FaMapMarkerAlt size={9} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ ...ONE_LINE_ELLIPSIS }} title={b.shopAddress}>{b.shopAddress}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {b.verificationCode && (
                          <>
                            <div style={{ fontSize: 9, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Verification</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, background: 'rgba(13,148,136,0.1)', border: `1px solid rgba(13,148,136,0.3)`, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.05em' }}>
                              {b.verificationCode}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', gap: 12 }}>
                      <div style={{ fontSize: 12, color: T.text2, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 600, ...TWO_LINE_CLAMP }} title={b.service}>{b.service}</div>
                          {b.isHomeVisit && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#ec4899', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.05em' }}>
                              Home Service
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{b.date} at {b.slotTime}</div>
                        {(() => {
                          const timerState = getCustomerBookingTimerState(b, clockTick);
                          if (!timerState) return null;

                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                              <span style={{ background: 'rgba(13,148,136,0.12)', color: T.gold, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '1px 8px', border: '1px solid rgba(13,148,136,0.25)' }}>
                                ACTIVE
                              </span>
                              <div style={{
                                background: '#fee2e2',
                                border: '1px solid #fca5a5',
                                borderRadius: 8,
                                padding: timerState.phase === 'auto' ? '0.32rem 0.55rem' : '0.32rem 0.6rem',
                                fontSize: timerState.phase === 'auto' ? 10 : 12,
                                fontWeight: 700,
                                color: '#dc2626',
                                minWidth: timerState.phase === 'auto' ? 120 : 52,
                                textAlign: 'center',
                              }}>
                                {timerState.label}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => handleNavigateToShop(b)}
                          style={{
                            padding: '4px 8px', fontSize: 11, background: T.surface, color: T.gold,
                            border: `1px solid ${T.gold}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                            fontFamily: "'Poppins',sans-serif", transition: 'opacity 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          Navigate
                        </button>
                        <button
                          onClick={() => handleCancelBooking(b.id)}
                          disabled={cancellingBookingId === b.id}
                          style={{
                            padding: '4px 8px', fontSize: 11, background: '#ef4444', color: '#fff',
                            border: 'none', borderRadius: 6, cursor: cancellingBookingId === b.id ? 'not-allowed' : 'pointer', fontWeight: 600,
                            opacity: cancellingBookingId === b.id ? 0.7 : 1,
                            fontFamily: "'Poppins',sans-serif", transition: 'opacity 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          {cancellingBookingId === b.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Past Bookings */}
          <section style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.br}`, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 Past Bookings
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {pastBookingsList.length === 0 ? (
                <div style={{ color: T.text3, fontSize: 13, textAlign: 'center', padding: '1rem' }}>No past bookings.</div>
              ) : (
                pastBookingsList.map(b => (
                  <div key={b.id} style={{ border: `1px solid ${T.br}`, borderRadius: 14, padding: '1rem', background: T.surface, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', minHeight: BOOKING_CARD_MIN_HEIGHT, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: T.text, fontSize: 15, ...ONE_LINE_ELLIPSIS }} title={b.shopName}>{b.shopName}</div>
                        <div style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                          <FaMapMarkerAlt size={9} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ ...ONE_LINE_ELLIPSIS }} title={b.shopAddress}>{b.shopAddress}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {b.verificationCode && (
                          <>
                            <div style={{ fontSize: 9, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Verification</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, background: 'rgba(13,148,136,0.1)', border: `1px solid rgba(13,148,136,0.3)`, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.05em' }}>
                              {b.verificationCode}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', gap: 12 }}>
                      <div style={{ fontSize: 12, color: T.text2, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 600, ...TWO_LINE_CLAMP }} title={b.service}>{b.service}</div>
                          {b.isHomeVisit && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#ec4899', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.05em' }}>
                              Home Service
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{b.date} at {b.slotTime}</div>
                        <div style={{ fontSize: 10, color: T.text3, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                          {getPastBookingStatusLabel(b)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleNavigateToShop(b)}
                        style={{
                          padding: '4px 8px', fontSize: 11, background: T.surface, color: T.gold,
                          border: `1px solid ${T.gold}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                          fontFamily: "'Poppins',sans-serif", transition: 'opacity 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        Navigate
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}>
          <form onSubmit={handleSaveProfile} style={{ background: T.surface, padding: '2rem', borderRadius: 16, width: 480, maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: T.text, marginBottom: '1.25rem' }}>Personal Information</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2, margin: '0 0 6px', textTransform: 'uppercase' }}>Full Name</label>
                <input required value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 8, border: `1px solid ${T.br}`, outline: 'none', fontFamily: "'Poppins',sans-serif", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2, margin: '0 0 6px', textTransform: 'uppercase' }}>Phone Number</label>
                <input required type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 8, border: `1px solid ${T.br}`, outline: 'none', fontFamily: "'Poppins',sans-serif", fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2, margin: '0 0 6px', textTransform: 'uppercase' }}>Email Address</label>
              <input type="email" required value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 8, border: `1px solid ${T.br}`, outline: 'none', fontFamily: "'Poppins',sans-serif", fontSize: 13 }} />
              <p style={{ color: T.text3, fontSize: 11, marginTop: '0.25rem' }}>
                Note: You'll need to login with your new email next time
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.text2, margin: '0 0 6px', textTransform: 'uppercase' }}>Home Address</label>

              {/* Current Location Button */}
              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  disabled={isLoadingLocation}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 1rem',
                    background: isLoadingLocation ? T.s2 : `rgba(13,148,136,0.1)`,
                    color: isLoadingLocation ? T.text3 : T.gold,
                    border: `1px solid ${isLoadingLocation ? T.br : 'rgba(13,148,136,0.3)'}`,
                    borderRadius: 8, cursor: isLoadingLocation ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: "'Poppins',sans-serif",
                    transition: 'all 0.15s'
                  }}
                >
                  <FaCrosshairs size={14} />
                  {isLoadingLocation ? 'Getting Location...' : 'Use Current Location'}
                </button>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ padding: '0.62rem 0.8rem', borderRadius: 8, border: `1px solid ${editHomeLocation ? T.gold : T.br}`, background: editHomeLocation ? 'rgba(13,148,136,0.05)' : T.s2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Poppins',sans-serif", fontSize: 13, color: editHomeLocation ? T.text : T.text3 }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '80%' }}>
                    {editHomeLocation ? editHomeLocation.address : 'Click on the map below to select your home address...'}
                  </span>
                  {editHomeLocation && <FaMapMarkerAlt color={T.gold} />}
                </div>
              </div>
              <div style={{ height: 200, width: '100%', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.br}`, position: 'relative' }}>
                <MapContainer
                  key={editHomeLocation ? `${editHomeLocation.lat}-${editHomeLocation.lng}` : 'default-home-location'}
                  center={editHomeMapCenter}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                  {editHomeLocation && (
                    <Marker position={[editHomeLocation.lat, editHomeLocation.lng]}>
                      <Popup>Your home address</Popup>
                    </Marker>
                  )}
                  <ClickHandler onSelect={(location) => setEditForm((prev) => ({
                    ...prev,
                    homeLocation: location,
                    address: location?.address || prev.address,
                    city: location?.city || prev.city,
                    state: location?.state || prev.state,
                  }))} />
                </MapContainer>
              </div>
              <p style={{ color: T.text3, fontSize: 11, marginTop: '0.5rem' }}>
                Click on the map to set your home address or use current location button above
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setIsEditingProfile(false)} disabled={isSavingProfile} style={{ flex: 1, padding: '0.6rem', background: T.s2, color: T.text2, border: 'none', borderRadius: 8, cursor: isSavingProfile ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>Cancel</button>
              <button type="submit" disabled={isSavingProfile} style={{ flex: 1, padding: '0.6rem', background: `linear-gradient(135deg,${T.gold},#0f766e)`, color: '#fff', border: 'none', borderRadius: 8, cursor: isSavingProfile ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>
                {isSavingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ─── Shop Booking Page ──────────────────────────────────────── */
const ShopBookingPage = ({ shop, onBack, onBookingSuccess }) => {
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedDate, setSelectedDate] = useState(INITIAL_BOOKING_DATE);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [createdBooking, setCreatedBooking] = useState(null);
  const preferredCustomerLocation = normalizeLocation(shop.defaultCustomerLocation) || null;
  const [homeLocation, setHomeLocation] = useState(null);
  const [isLoadingHomeLocation, setIsLoadingHomeLocation] = useState(false);
  const [shopBarbers, setShopBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [showPaymentQr, setShowPaymentQr] = useState(false);
  const [effectiveSlotDuration, setEffectiveSlotDuration] = useState(30);
  const [timelineOpen, setTimelineOpen] = useState(Number(shop.open || CUSTOMER_TIMELINE_OPEN));
  const [timelineClose, setTimelineClose] = useState(Number(shop.close || CUSTOMER_TIMELINE_CLOSE));
  const bookingRedirectTimeoutRef = useRef(null);

  const selectedServices = shop.services.filter((service) => selectedServiceIds.includes(service.id));
  const hasSelectedServices = selectedServices.length > 0;
  const selectedServiceNames = formatServiceNames(selectedServices);
  const totalServiceDuration = selectedServices.reduce(
    (total, service) => total + Number(service.duration ?? service.durationMinutes ?? 0),
    0
  );
  const totalServicePrice = selectedServices.reduce(
    (total, service) => total + Number(service.price || 0),
    0
  );
  const svcDur = totalServiceDuration || 30;
  const isHomeVisitBooking = shop.isHomeService && Boolean(homeLocation);
  const activeCustomerLocation = isHomeVisitBooking ? homeLocation : null;
  const defaultTimelineOpen = Number(shop.open || CUSTOMER_TIMELINE_OPEN);
  const defaultTimelineClose = Number(shop.close || CUSTOMER_TIMELINE_CLOSE);
  const selectedBarberId = selectedBarber?._id || selectedBarber?.id || selectedBarber || null;
  const paymentBarber =
    shopBarbers.find((barber) => selectedBarberId && String(barber._id || barber.id || '') === String(selectedBarberId))
    || shopBarbers.find((barber) => barber.role === 'owner' && isValidUpiId(barber.upiId))
    || shopBarbers.find((barber) => isValidUpiId(barber.upiId))
    || null;
  const paymentUpiId = normalizeUpiId(paymentBarber?.upiId || '');
  const upiPaymentLink = paymentUpiId
    ? buildUpiPaymentLink({
      upiId: paymentUpiId,
      payeeName: paymentBarber?.role === 'owner' ? shop.name : (paymentBarber?.name || shop.name),
      amount: totalServicePrice,
      note: `${shop.name} booking`,
    })
    : '';
  const paymentQrImageUrl = upiPaymentLink
    ? `https://quickchart.io/qr?size=220&text=${encodeURIComponent(upiPaymentLink)}`
    : '';
  const resolveTimelineBound = (value, fallback) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
  };

  const toggleServiceSelection = (serviceId) => {
    setSelectedServiceIds((prev) => (
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    ));
  };

  useEffect(() => {
    let cancelled = false;

    const fetchBarbers = async () => {
      setLoadingBarbers(true);
      try {
        const res = await apiRequest(`/shops/${shop.id}/barbers`, { method: 'GET', auth: 'none' });
        if (!cancelled) {
          setShopBarbers(res.data || []);
        }
      } catch {
        if (!cancelled) {
          setShopBarbers([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingBarbers(false);
        }
      }
    };

    fetchBarbers();
    return () => { cancelled = true; };
  }, [shop.id]);

  useEffect(() => {
    let cancelled = false;

    const fetchSlots = async ({ silent = false } = {}) => {
      if (!hasSelectedServices || !selectedDate) {
        setAvailableSlots([]);
        setEffectiveSlotDuration(30);
        setTimelineOpen(defaultTimelineOpen);
        setTimelineClose(defaultTimelineClose);
        setSelectedSlot(null);
        if (!silent) setLoadingSlots(false);
        return;
      }

      if (isTuesdayDateStr(selectedDate.str)) {
        setAvailableSlots([]);
        setEffectiveSlotDuration(svcDur);
        setTimelineOpen(defaultTimelineOpen);
        setTimelineClose(defaultTimelineClose);
        setSelectedSlot(null);
        if (!silent) setLoadingSlots(false);
        return;
      }

      if (!silent) setLoadingSlots(true);
      try {
        const params = new URLSearchParams({
          shopId: shop.id,
          date: selectedDate.str,
          serviceDuration: svcDur,
          bookingType: isHomeVisitBooking ? 'homevisit' : 'inshop',
        });
        if (activeCustomerLocation?.lat != null && activeCustomerLocation?.lng != null) {
          params.set('customerLat', String(activeCustomerLocation.lat));
          params.set('customerLng', String(activeCustomerLocation.lng));
        }
        const res = await apiRequest(`/bookings/shop-slots?${params.toString()}`, {
          method: 'GET',
          auth: 'none',
        });
        if (!cancelled && res?.data) {
          const slots = Array.isArray(res.data.slots) ? res.data.slots : [];
          const nextOpen = resolveTimelineBound(res.data.openTime, defaultTimelineOpen);
          const nextClose = resolveTimelineBound(res.data.closeTime, defaultTimelineClose);
          setAvailableSlots(slots);
          setEffectiveSlotDuration(res.data.effectiveDurationMinutes || svcDur);
          setTimelineOpen(nextOpen);
          setTimelineClose(nextClose > nextOpen ? nextClose : defaultTimelineClose);
          setSelectedSlot((prev) => (
            prev !== null && slots.some((slot) => slot.color === 'GREEN' && prev >= slot.start && prev < slot.end)
              ? prev
              : null
          ));
        }
      } catch (err) {
        console.error('Failed to fetch slots:', err);
        if (!cancelled) {
          setAvailableSlots([]);
          setEffectiveSlotDuration(svcDur);
          setTimelineOpen(defaultTimelineOpen);
          setTimelineClose(defaultTimelineClose);
          setSelectedSlot(null);
        }
      } finally {
        if (!cancelled && !silent) setLoadingSlots(false);
      }
    };

    const handleWindowFocus = () => {
      void fetchSlots({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchSlots({ silent: true });
      }
    };

    void fetchSlots();
    const refreshInterval = window.setInterval(() => {
      void fetchSlots({ silent: true });
    }, 15000);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shop.id, hasSelectedServices, selectedDate, svcDur, isHomeVisitBooking, activeCustomerLocation?.lat, activeCustomerLocation?.lng, defaultTimelineOpen, defaultTimelineClose]);

  useEffect(() => () => {
    if (bookingRedirectTimeoutRef.current) {
      window.clearTimeout(bookingRedirectTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    setShowPaymentQr(false);
  }, [selectedServiceNames, selectedDate?.str, selectedSlot, totalServicePrice, activeCustomerLocation?.address]);

  const completeBookingSuccess = (booking = createdBooking) => {
    if (bookingRedirectTimeoutRef.current) {
      window.clearTimeout(bookingRedirectTimeoutRef.current);
      bookingRedirectTimeoutRef.current = null;
    }

    setConfirmed(false);
    onBookingSuccess(booking || null);
  };

  const handleUseCurrentHomeLocation = async () => {
    setIsLoadingHomeLocation(true);

    try {
      const location = await getCurrentBrowserLocation();
      setHomeLocation(location);
    } catch (err) {
      alert(err.message || 'Unable to get your current location. Please enable location services.');
    } finally {
      setIsLoadingHomeLocation(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!hasSelectedServices || !selectedDate || selectedSlot === null) return;
    if (isHomeVisitBooking && !activeCustomerLocation) return;
    if (isSubmittingBooking) return;

    if (isTuesdayDateStr(selectedDate.str)) {
      alert('This shop is closed on Tuesday.');
      return;
    }

    const todayStr = getDateStr(0);
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    if (selectedDate.str === todayStr && selectedSlot < currentMinutes) {
      alert('Please choose a current or future time slot.');
      return;
    }

    try {
      setIsSubmittingBooking(true);
      const bookingData = {
        shopId: shop.id,
        selectedServices: selectedServices.map((service) => ({
          name: service.name,
          durationMinutes: Number(service.duration ?? service.durationMinutes ?? 0),
          price: Number(service.price || 0),
          ...(service.category ? { category: service.category } : {}),
          ...(service.genderSpecific ? { genderSpecific: service.genderSpecific } : {}),
        })),
        date: selectedDate.str,
        slotStartMinutes: selectedSlot,
        bookingType: isHomeVisitBooking ? 'homevisit' : 'inshop',
      };

      if (activeCustomerLocation) {
        bookingData.homeLocation = normalizeLocation(activeCustomerLocation);
      }

      const res = await apiRequest('/bookings', {
        method: 'POST',
        auth: 'customer',
        body: bookingData,
      });

      if (res.success) {
        setCreatedBooking(res.data || null);
        setConfirmed(true);
        emitBookingSync({
          type: 'created',
          bookingId: res.data?._id || null,
          dateIso: selectedDate.str,
        });
        window.dispatchEvent(new Event('bookmycut_bookings_refresh'));
        bookingRedirectTimeoutRef.current = window.setTimeout(() => {
          completeBookingSuccess(res.data || null);
        }, BOOKING_CONFIRM_REDIRECT_MS);
      }
    } catch (err) {
      alert(err.message || 'Failed to create booking');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handlePrimaryBookingAction = () => {
    if (loadingBarbers || isSubmittingBooking) {
      return;
    }

    if (!paymentUpiId || showPaymentQr) {
      void handleConfirmBooking();
      return;
    }

    if (!hasSelectedServices || !selectedDate || selectedSlot === null) return;
    if (isHomeVisitBooking && !activeCustomerLocation) return;

    if (isTuesdayDateStr(selectedDate.str)) {
      alert('This shop is closed on Tuesday.');
      return;
    }

    const todayStr = getDateStr(0);
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    if (selectedDate.str === todayStr && selectedSlot < currentMinutes) {
      alert('Please choose a current or future time slot.');
      return;
    }

    setShowPaymentQr(true);
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'Poppins',sans-serif" }}>
      {/* Header */}
      <header style={{
        background: T.surface, borderBottom: `1px solid ${T.br}`,
        position: 'sticky', top: 0, zIndex: 30, padding: '0 1.5rem',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 1rem',
              background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer',
              color: T.text2, fontSize: 13, fontWeight: 600, fontFamily: "'Poppins',sans-serif",
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.s2}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <FaArrowLeft size={14} /> Back
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 18, color: T.text, fontWeight: 600 }}>{shop.name}</div>
            <div style={{ fontSize: 12, color: T.text3 }}>{shop.address}</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
          {/* Left: Service Selection */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: '0.5rem' }}>Select Services</h2>
            <p style={{ fontSize: 12, color: T.text3, marginBottom: '1rem' }}>Choose one or more services. Time and price update automatically.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {shop.services.map(svc => (
                <button
                  key={svc.id}
                  onClick={() => toggleServiceSelection(svc.id)}
                  style={{
                    padding: '1rem', border: `1px solid ${selectedServiceIds.includes(svc.id) ? T.gold : T.br}`,
                    borderRadius: 12, background: selectedServiceIds.includes(svc.id) ? 'rgba(13,148,136,0.05)' : T.surface,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    fontFamily: "'Poppins',sans-serif"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.gold + '88'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = selectedServiceIds.includes(svc.id) ? T.gold : T.br}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, color: T.text, fontSize: 14 }}>{svc.name}</div>
                    {selectedServiceIds.includes(svc.id) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: T.gold, color: '#fff', flexShrink: 0 }}>
                        <FaCheck size={10} />
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: T.text2, fontSize: 12 }}>{svc.duration}min</span>
                    <span style={{ color: T.gold, fontWeight: 700, fontSize: 14 }}>₹{svc.price}</span>
                  </div>
                </button>
              ))}
            </div>
            {hasSelectedServices && (
              <div style={{ marginTop: '1rem', background: T.s2, border: `1px solid ${T.br}`, borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: 12, color: T.text2, marginBottom: 4 }}>Selected Services</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{selectedServiceNames}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
                  <span style={{ color: T.text2 }}>Total Time: <strong style={{ color: T.text }}>{totalServiceDuration} min</strong></span>
                  <span style={{ color: T.text2 }}>Total Price: <strong style={{ color: T.gold }}>₹{totalServicePrice}</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Booking Flow */}
          <div>
            {hasSelectedServices ? (
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: '1rem' }}>Select Time Slot</h2>
                <div style={{ background: T.s2, border: `1px solid ${T.br}`, borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, color: T.text2, marginBottom: 4 }}>Booking Summary</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{selectedServiceNames}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: T.text2 }}>Slot Length: <strong style={{ color: T.text }}>{effectiveSlotDuration} min</strong></span>
                    <span style={{ color: T.text2 }}>Price: <strong style={{ color: T.gold }}>₹{totalServicePrice}</strong></span>
                  </div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    {DATES.map(d => (
                      <button
                        key={d.str}
                        onClick={() => setSelectedDate(d)}
                        style={{
                          flex: 1, padding: '0.5rem', border: `1px solid ${selectedDate?.str === d.str ? T.gold : T.br}`,
                          borderRadius: 8, background: selectedDate?.str === d.str ? 'rgba(13,148,136,0.05)' : T.surface,
                          cursor: 'pointer', fontSize: 12, fontWeight: selectedDate?.str === d.str ? 600 : 400,
                          color: selectedDate?.str === d.str ? T.gold : T.text2,
                          fontFamily: "'Poppins',sans-serif", transition: 'all 0.15s'
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <ContinuousTimeline
                    availableSlots={availableSlots}
                    loading={loadingSlots}
                    onSlotSelect={setSelectedSlot}
                    selectedSlot={selectedSlot}
                    duration={effectiveSlotDuration}
                    openTime={timelineOpen}
                    closeTime={timelineClose}
                    date={selectedDate.str}
                  />
                </div>

                {selectedSlot !== null && !isTuesdayDateStr(selectedDate.str) && (
                  <div style={{ background: T.s2, padding: '1rem', borderRadius: 12, border: `1px solid ${T.br}`, marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: 12, color: T.text2, marginBottom: 4 }}>Selected Time</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.gold }}>{fmtTime(selectedSlot)}</div>
                    <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{selectedDate.label}</div>
                    <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>Reserved for {effectiveSlotDuration} minutes</div>
                  </div>
                )}

                {shop.isHomeService && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: '1rem' }}>Select Home Location</h3>
                    <div style={{ marginBottom: '1rem' }}>
                      <button
                        type="button"
                        onClick={handleUseCurrentHomeLocation}
                        disabled={isLoadingHomeLocation}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 1rem',
                          background: isLoadingHomeLocation ? T.s2 : 'rgba(13,148,136,0.1)',
                          color: isLoadingHomeLocation ? T.text3 : T.gold,
                          border: `1px solid ${isLoadingHomeLocation ? T.br : 'rgba(13,148,136,0.3)'}`,
                          borderRadius: 8, cursor: isLoadingHomeLocation ? 'not-allowed' : 'pointer',
                          fontSize: 12, fontWeight: 600, fontFamily: "'Poppins',sans-serif",
                          transition: 'all 0.15s'
                        }}
                      >
                        <FaCrosshairs size={14} />
                        {isLoadingHomeLocation ? 'Getting Location...' : 'Use Current Location'}
                      </button>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ padding: '0.62rem 0.8rem', borderRadius: 8, border: `1px solid ${homeLocation ? T.gold : T.br}`, background: homeLocation ? 'rgba(13,148,136,0.05)' : T.s2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Poppins',sans-serif", fontSize: 13, color: homeLocation ? T.text : T.text3 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '80%' }}>
                          {homeLocation ? homeLocation.address : 'Click on the map below to pinpoint...'}
                        </span>
                        {homeLocation && <FaMapMarkerAlt color={T.gold} />}
                      </div>
                    </div>
                    <div style={{ height: 200, width: '100%', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.br}`, position: 'relative' }}>
                      <MapContainer
                        center={(homeLocation || preferredCustomerLocation) ? [Number((homeLocation || preferredCustomerLocation).lat), Number((homeLocation || preferredCustomerLocation).lng)] : [12.9716, 77.5946]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                        {homeLocation && (
                          <Marker position={[homeLocation.lat, homeLocation.lng]}>
                            <Popup>Your home location</Popup>
                          </Marker>
                        )}
                        <ClickHandler onSelect={setHomeLocation} />
                      </MapContainer>
                    </div>
                  </div>
                )}

                {showPaymentQr && paymentUpiId && (
                  <div style={{ background: T.s2, padding: '1rem', borderRadius: 12, border: `1px solid ${T.br}`, marginBottom: '1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: T.text2, marginBottom: 6 }}>Scan UPI QR</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.gold, marginBottom: 10 }}>₹{totalServicePrice}</div>
                    <img
                      src={paymentQrImageUrl}
                      alt="UPI payment QR"
                      style={{ width: 220, height: 220, borderRadius: 12, border: `1px solid ${T.br}`, background: '#fff', padding: 10, objectFit: 'contain', maxWidth: '100%' }}
                    />
                    <div style={{ fontSize: 12, color: T.text2, marginTop: 10, wordBreak: 'break-word' }}>{paymentUpiId}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>After payment, tap Book Now to confirm your booking.</div>
                  </div>
                )}

                <button
                  onClick={handlePrimaryBookingAction}
                  disabled={isSubmittingBooking || loadingBarbers || selectedSlot === null || isTuesdayDateStr(selectedDate.str) || (isHomeVisitBooking && !activeCustomerLocation)}
                  style={{
                    width: '100%', padding: '0.8rem', borderRadius: 8,
                    background: `linear-gradient(135deg,${T.gold},#0f766e)`,
                    color: '#fff', fontWeight: 700, fontSize: 14, border: 'none',
                    cursor: !isSubmittingBooking && !loadingBarbers && selectedSlot !== null && !isTuesdayDateStr(selectedDate.str) && (!isHomeVisitBooking || activeCustomerLocation) ? 'pointer' : 'not-allowed',
                    fontFamily: "'Poppins',sans-serif", transition: 'opacity 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {isSubmittingBooking ? 'Booking...' : loadingBarbers ? 'Loading...' : (showPaymentQr && paymentUpiId ? 'Book Now' : 'Confirm Booking')}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: T.text3 }}>
                <FaScissors size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>Select one or more services to continue</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Booking Confirmation Modal */}
      {confirmed && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: T.surface, padding: '2rem', borderRadius: 16, width: 400, maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: T.text, marginBottom: '1.5rem' }}>Booking Confirmed! 🎉</h3>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: T.text2, fontSize: 13 }}>Services:</span>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{selectedServiceNames}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: T.text2, fontSize: 13 }}>Date:</span>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{selectedDate.label}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: T.text2, fontSize: 13 }}>Time:</span>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{fmtTime(selectedSlot)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: T.text2, fontSize: 13 }}>Duration:</span>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{effectiveSlotDuration} min</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: T.text2, fontSize: 13 }}>Price:</span>
                <span style={{ color: T.gold, fontSize: 13, fontWeight: 600 }}>₹{totalServicePrice}</span>
              </div>
              {shop.isHomeService && homeLocation && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: T.text2, fontSize: 13 }}>Location:</span>
                  <span style={{ color: T.text, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{homeLocation.address}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: T.text3 }}>
                Redirecting to dashboard...
              </div>
            </div>
            <button
              onClick={() => {
                completeBookingSuccess();
              }}
              style={{
                width: '100%', padding: '0.6rem', background: T.s2, color: T.text2, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: "'Poppins',sans-serif"
              }}
            >
              Go to Dashboard Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Main App Component ────────────────────────────────────── */
const CustomerDashboard = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedShop, setSelectedShop] = useState(null);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [recentBooking, setRecentBooking] = useState(null);

  const handleBook = (shop) => {
    setSelectedShop(shop);
    setCurrentPage('booking');
  };

  const handleBack = () => {
    setCurrentPage('dashboard');
    setSelectedShop(null);
  };

  const handleBookingSuccess = (booking = null) => {
    if (booking) {
      setRecentBooking(booking);
    }
    setDashboardRefreshKey((prev) => prev + 1);
    setCurrentPage('dashboard');
    setSelectedShop(null);
  };

  if (currentPage === 'booking' && selectedShop) {
    return <ShopBookingPage shop={selectedShop} onBack={handleBack} onBookingSuccess={handleBookingSuccess} />;
  }

  return <DashboardPage onBook={handleBook} refreshKey={dashboardRefreshKey} recentBooking={recentBooking} />;
};

export default CustomerDashboard;
