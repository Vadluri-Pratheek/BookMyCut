import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiRequest,
  getBarberProfileCache,
  getBarberToken,
  setBarberProfileCache,
  setBarberToken,
} from '../api/client';
import { FaMapMarkerAlt, FaCheck, FaTimes } from 'react-icons/fa';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import BrandLogo from '../components/BrandLogo';
import MapPicker from '../components/MapPicker';
import ServiceCheckbox from '../components/ServiceCheckbox';
import { SERVICES } from '../data/services';
import { getLocalDateStr, getLocalDateWithOffset, isTuesdayDateStr } from '../utils/date';
import { formatCoordinateAddress, normalizeLocation } from '../utils/location';
import { openDirectionsFromCurrentLocation } from '../utils/navigation';
import L from 'leaflet';

// Fix Leaflet paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* ─── Inject styles ──────────────────────────────────────────── */
const STYLE = `
  @keyframes slideIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:none; } }
  .bdb-stat-grid  { display:flex; gap:1rem; flex-wrap:wrap; }
  .bdb-split      { display:flex; gap:1.25rem; align-items:flex-start; }
  .bdb-left       { flex:0 0 27%; min-width:260px; }
  .bdb-right      { flex:1; min-width:300px; }
  .bdb-scroll     { height:220px; overflow-y:auto; padding-right:4px; }
  .bdb-scroll::-webkit-scrollbar { width:5px; }
  .bdb-scroll::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
  .bdb-scroll::-webkit-scrollbar-track { background:#f8fafc; }
  @media (max-width:1024px) {
    .bdb-split { flex-direction:column; }
    .bdb-left  { flex:none; width:100%; min-width:0; }
  }
  @media (max-width:640px) {
    .bdb-stat-grid { display:grid; grid-template-columns:1fr 1fr; }
  }
`;

/* ─── Theme ──────────────────────────────────────────────────── */
const C = {
  teal: '#ff7a00', tealD: '#ef6400', tealL: '#fff1e5',
  bg: '#eef2f7', white: '#ffffff', border: '#e4ebf3',
  text: '#0f172a', text2: '#66758d', text3: '#9eabc0',
};

/* ─── Timeline constants ─────────────────────────────────────── */
const OPEN = 7 * 60;
const CLOSE = 23 * 60;
const TOTAL = CLOSE - OPEN;
const DEFAULT_BARBER_WORK_START = 540;
const DEFAULT_BARBER_WORK_END = 1260;

const pct = (m) => `${((m - OPEN) / TOTAL * 100).toFixed(3)}%`;
const pctW = (d) => `${(d / TOTAL * 100).toFixed(3)}%`;

/* ─── Time utilities ─────────────────────────────────────────── */
const minsToLabel = (m) => {
  const h = Math.floor(m / 60), mn = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${String(mn).padStart(2, '0')} ${ap}`;
};
const timeStrToMins = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const minsToTimeStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const normalizeScheduleBreaks = (breaks = []) =>
  Array.isArray(breaks)
    ? breaks
      .map((item) => ({
        breakStart: Number(item.breakStart),
        breakEnd: Number(item.breakEnd),
        ...(item.label ? { label: item.label } : {}),
      }))
      .filter((item) => Number.isFinite(item.breakStart) && Number.isFinite(item.breakEnd))
    : [];

const getDefaultBarberSchedule = (barber) => ({
  workStart: Number.isFinite(Number(barber?.generalWorkStart))
    ? Number(barber.generalWorkStart)
    : DEFAULT_BARBER_WORK_START,
  workEnd: Number.isFinite(Number(barber?.generalWorkEnd))
    ? Number(barber.generalWorkEnd)
    : DEFAULT_BARBER_WORK_END,
  breaks: normalizeScheduleBreaks(barber?.generalBreaks),
});

const getVisibleTimelineSegment = (startMins, endMins) => {
  const start = Number(startMins);
  const end = Number(endMins);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const visibleStart = Math.max(start, OPEN);
  const visibleEnd = Math.min(end, CLOSE);

  if (visibleEnd <= visibleStart) {
    return null;
  }

  return {
    left: pct(visibleStart),
    width: pctW(visibleEnd - visibleStart),
  };
};

const getVisibleWorkWindow = (schedule) => {
  const workStart = Number(schedule?.workStart);
  const workEnd = Number(schedule?.workEnd);

  if (!Number.isFinite(workStart) || !Number.isFinite(workEnd) || workEnd <= workStart) {
    return null;
  }

  const visibleStart = Math.max(workStart, OPEN);
  const visibleEnd = Math.min(workEnd, CLOSE);

  if (visibleEnd <= visibleStart) {
    return null;
  }

  return {
    start: visibleStart,
    end: visibleEnd,
  };
};

/* ─── Date utilities ─────────────────────────────────────────── */
const getDs = (off = 0) => getLocalDateStr(off);
const getDayLbl = (off) => {
  const d = getLocalDateWithOffset(off);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

const DATE_PILLS = [0, 1, 2, 3].map(o => ({ offset: o, str: getDs(o), label: getDayLbl(o) }));
const TODAY = getDs(0);

/* ─── Utils ──────────────────────────────────────────────────── */
const AV = ['#ff7a00', '#ff9b45', '#f97316', '#ea580c', '#fb923c', '#fdba74'];
const CURRENT_CUSTOMER_BUFFER_SECONDS = 60;

const getCatalogServicesForShopGender = (genderServed) => {
  if (genderServed === 'Male') {
    return SERVICES.filter((service) => service.gender === 'male' || service.gender === 'both');
  }
  if (genderServed === 'Female') {
    return SERVICES.filter((service) => service.gender === 'female' || service.gender === 'both');
  }
  return SERVICES;
};

const getServiceGenderSpecificForShop = (service, genderServed) => {
  if (genderServed === 'Male' || genderServed === 'Female') {
    return genderServed;
  }
  if (service.gender === 'male') return 'Male';
  if (service.gender === 'female') return 'Female';
  return 'Unisex';
};

const findCatalogServiceForShopService = (shopService, genderServed) => {
  const allowedServices = getCatalogServicesForShopGender(genderServed);
  const exactMatches = allowedServices.filter(
    (service) =>
      service.name === shopService.name
      && Number(service.duration) === Number(shopService.durationMinutes)
  );

  if (exactMatches.length <= 1) {
    return exactMatches[0] || null;
  }

  return (
    exactMatches.find(
      (service) =>
        getServiceGenderSpecificForShop(service, genderServed) === shopService.genderSpecific
    )
    || exactMatches[0]
  );
};

const getCurrentCustomerTimerRemaining = (booking) => {
  if (!booking) return CURRENT_CUSTOMER_BUFFER_SECONDS;

  const startDateTime = new Date();
  startDateTime.setHours(Math.floor(booking.startMins / 60), booking.startMins % 60, 0, 0);

  const expiresAt = startDateTime.getTime() + (CURRENT_CUSTOMER_BUFFER_SECONDS * 1000);
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
};

/* ─── Toast ──────────────────────────────────────────────────── */
const Toast = ({ message, type }) => (
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

/* ─── StatCard ───────────────────────────────────────────────── */
const StatCard = ({ icon, title, value, trend }) => {
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

/* ─── BookingCard ────────────────────────────────────────────── */
const BookingCard = ({ booking }) => {
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

/* ─── Continuous Timeline ────────────────────────────────────── */
const ContinuousTimeline = ({ bookings, blockedSlots, schedule, date }) => {
  const bks = (bookings[date] || []).filter((booking) => booking.status === 'upcoming');
  const blocked = Array.isArray(schedule?.breaks)
    ? schedule.breaks
    : blockedSlots.filter((item) => item.date === date);
  const isToday = date === TODAY;
  const isClosedDay = isTuesdayDateStr(date);
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const visibleWorkWindow = getVisibleWorkWindow(schedule);
  const outsideSegments = isClosedDay
    ? [{ startMins: OPEN, endMins: CLOSE }]
    : visibleWorkWindow
      ? [
        ...(visibleWorkWindow.start > OPEN ? [{ startMins: OPEN, endMins: visibleWorkWindow.start }] : []),
        ...(visibleWorkWindow.end < CLOSE ? [{ startMins: visibleWorkWindow.end, endMins: CLOSE }] : []),
      ]
      : (schedule ? [{ startMins: OPEN, endMins: CLOSE }] : []);

  return (
    <div>
      {/* Track */}
      <div style={{ position: 'relative', height: 44, borderRadius: 8, background: '#f8fafc', border: `1px solid ${C.border}`, overflow: 'hidden' }}>

        {/* Green base — available */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,122,0,0.16)', borderRight: '1px solid rgba(255,122,0,0.24)' }} />

        {outsideSegments.map((segment, index) => {
          const visibleSegment = getVisibleTimelineSegment(segment.startMins, segment.endMins);
          if (!visibleSegment) return null;

          return (
            <div key={`outside-${index}`} style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              left: visibleSegment.left,
              width: visibleSegment.width,
              background: 'rgba(148,163,184,0.3)',
              borderLeft: '1px solid rgba(148,163,184,0.35)',
              borderRight: '1px solid rgba(148,163,184,0.35)',
            }} />
          );
        })}

        {/* Booked segments (grey) */}
        {!isClosedDay && bks.map((b, i) => {
          const visibleSegment = getVisibleTimelineSegment(b.startMins, b.endMins);
          if (!visibleSegment) return null;

          return (
            <div key={i} style={{
              position: 'absolute', top: 0, height: '100%',
              left: visibleSegment.left, width: visibleSegment.width,
              background: 'rgba(100,116,139,0.45)',
              borderLeft: '1px solid rgba(100,116,139,0.5)',
              borderRight: '1px solid rgba(100,116,139,0.5)',
            }} />
          );
        })}

        {/* Blocked segments (amber) */}
        {!isClosedDay && blocked.map((b, i) => {
          const visibleSegment = getVisibleTimelineSegment(
            b.startMins ?? b.breakStart,
            b.endMins ?? b.breakEnd
          );
          if (!visibleSegment) return null;

          return (
            <div key={i} style={{
              position: 'absolute', top: 0, height: '100%',
              left: visibleSegment.left, width: visibleSegment.width,
              background: 'rgba(201,124,46,0.38)',
              borderLeft: '1px solid rgba(201,124,46,0.5)',
              borderRight: '1px solid rgba(201,124,46,0.5)',
            }} />
          );
        })}

        {/* Past time greyed out overlay */}
        {isToday && !isClosedDay && nowMins > OPEN && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: pctW(Math.min(nowMins, CLOSE) - OPEN),
            background: 'rgba(226,232,240,0.6)', /* translucent slate background */
            backdropFilter: 'grayscale(80%)',
            borderRight: `2px dashed ${C.text3}`,
            zIndex: 10,
            pointerEvents: 'none'
          }} />
        )}

        {isClosedDay && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 16,
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
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: C.text3 }}>
        <span>{minsToLabel(OPEN)}</span>
        <span>{minsToLabel(OPEN + TOTAL / 4)}</span>
        <span>{minsToLabel(OPEN + TOTAL / 2)}</span>
        <span>{minsToLabel(OPEN + TOTAL * 3 / 4)}</span>
        <span>{minsToLabel(CLOSE)}</span>
      </div>


    </div>
  );
};

/* ─── Form label ─────────────────────────────────────────────── */
const Label = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.text2, marginBottom: 4 }}>
    {children}
  </div>
);

const inputSt = {
  width: '100%', padding: '0.48rem 0.7rem', borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13, color: C.text,
  fontFamily: "'Poppins',sans-serif", outline: 'none',
  background: C.white, boxSizing: 'border-box',
};

/* ─── Barber Profile Dropdown ──────────────────────────────────── */
const BarberProfileDropdown = ({ open, onClose, user, onEditProfile, onEditShop }) => {
  const navigate = useNavigate();
  if (!open) return null;
  const isOwner = user?.role === 'owner';
  const items = [
    { label: 'Edit Shop Details', icon: '🏪', disabled: !isOwner },
    { label: 'Edit Profile', icon: '👤', disabled: false },
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
              if (it.label === 'Edit Profile') onEditProfile();
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

/* ─── Edit Profile Modal ────────────────────────────────────── */
const EditProfileModal = ({ open, onClose, user, onSave }) => {
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;

    setForm({
      name: user.name || '',
      phone: user.phone || '',
    });
  }, [open, user.name, user.phone]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest('/barbers/profile', {
        method: 'PUT',
        auth: 'barber',
        body: form,
      });
      onSave(res.data);
      onClose();
    } catch (err) {
      alert(err.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 400, padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: '1rem' }}>Edit Profile</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <Label>Full Name</Label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputSt} required />
          </div>
          <div>
            <Label>Phone Number</Label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputSt} required />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${C.teal},${C.tealD})`, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Edit Shop Modal ─────────────────────────────────────── */
const EditShopModal = ({ open, onClose, user, onSave }) => {
  const [form, setForm] = useState({
    name: user.shopName,
    address: user.shopAddress,
    city: user.shopCity || '',
    state: user.shopState || '',
    lat: user.shopLat ?? null,
    lng: user.shopLng ?? null,
    openTime: user.openTime || 540,
    closeTime: user.closeTime || 1260,
    genderServed: 'Unisex',
  });
  const [busy, setBusy] = useState(false);
  const [loadingShop, setLoadingShop] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [loadedServices, setLoadedServices] = useState([]);
  const [shopBarbers, setShopBarbers] = useState([]);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [removingBarberId, setRemovingBarberId] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({
        name: user.shopName,
        address: user.shopAddress,
        city: user.shopCity || '',
        state: user.shopState || '',
        lat: user.shopLat ?? null,
        lng: user.shopLng ?? null,
        openTime: user.openTime || 540,
        closeTime: user.closeTime || 1260,
        genderServed: 'Unisex',
      });
      setLoadedServices([]);
      setSelectedServiceIds([]);
      setShopBarbers([]);
      setRemovingBarberId(null);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    const loadShopDetails = async () => {
      setLoadingShop(true);
      setLoadingBarbers(true);
      try {
        const [shopRes, barbersRes] = await Promise.all([
          apiRequest('/shops/my', {
            method: 'GET',
            auth: 'barber',
          }),
          apiRequest('/barbers/staff', {
            method: 'GET',
            auth: 'barber',
          }),
        ]);

        if (cancelled || !shopRes?.data) return;

        const shop = shopRes.data;
        const genderServed = shop.genderServed || 'Unisex';
        const services = Array.isArray(shop.services) ? shop.services : [];
        const mappedServiceIds = services
          .map((service) => findCatalogServiceForShopService(service, genderServed)?.id)
          .filter(Boolean);

        setForm({
          name: shop.name || user.shopName,
          address: shop.location?.address || user.shopAddress,
          city: shop.location?.city || user.shopCity || '',
          state: shop.location?.state || user.shopState || '',
          lat: shop.location?.coordinates?.[1] ?? user.shopLat ?? null,
          lng: shop.location?.coordinates?.[0] ?? user.shopLng ?? null,
          openTime: shop.openTime || 540,
          closeTime: shop.closeTime || 1260,
          genderServed,
        });
        setLoadedServices(services);
        setSelectedServiceIds(mappedServiceIds);
        setShopBarbers(Array.isArray(barbersRes?.data) ? barbersRes.data : []);
      } catch (err) {
        if (!cancelled) {
          alert(err.message || 'Failed to load shop details');
        }
      } finally {
        if (!cancelled) {
          setLoadingShop(false);
          setLoadingBarbers(false);
        }
      }
    };

    loadShopDetails();
    return () => { cancelled = true; };
  }, [open, user]);

  if (!open) return null;

  const handleMapSelect = async (loc) => {
    const nextLocation = normalizeLocation(loc, {
      address: formatCoordinateAddress(loc?.lat, loc?.lng),
    });

    if (!nextLocation) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      lat: nextLocation.lat,
      lng: nextLocation.lng,
      address: nextLocation.address || prev.address,
      city: nextLocation.city || prev.city,
      state: nextLocation.state || prev.state,
    }));
  };

  const handleRemoveBarber = async (barberId) => {
    const barber = shopBarbers.find((item) => item._id === barberId);
    if (!barber) return;

    const confirmed = window.confirm(`Remove ${barber.name} from this shop?`);
    if (!confirmed) return;

    setRemovingBarberId(barberId);
    try {
      await apiRequest(`/barbers/staff/${barberId}`, {
        method: 'DELETE',
        auth: 'barber',
      });
      setShopBarbers((prev) => prev.filter((item) => item._id !== barberId));
    } catch (err) {
      alert(err.message || 'Failed to remove barber');
    } finally {
      setRemovingBarberId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const catalogServices = getCatalogServicesForShopGender(form.genderServed);
      const existingServicesById = new Map(
        loadedServices
          .map((service) => {
            const matchedService = findCatalogServiceForShopService(service, form.genderServed);
            return matchedService ? [matchedService.id, service] : null;
          })
          .filter(Boolean)
      );
      const servicesPayload = selectedServiceIds
        .map((serviceId) => {
          const existingService = existingServicesById.get(serviceId);
          if (existingService) {
            return existingService;
          }

          const catalogService = catalogServices.find((service) => service.id === serviceId);
          if (!catalogService) return null;

          return {
            name: catalogService.name,
            durationMinutes: catalogService.duration,
            price: Math.max(50, Math.round(catalogService.duration * 8)),
            genderSpecific: getServiceGenderSpecificForShop(catalogService, form.genderServed),
          };
        })
        .filter(Boolean);

      const res = await apiRequest('/shops/my', {
        method: 'PUT',
        auth: 'barber',
        body: {
          ...form,
          services: servicesPayload,
        },
      });
      onSave(res.data);
      onClose();
    } catch (err) {
      alert(err.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: '1rem' }}>Edit Shop Details</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Shop Details</div>
          <div>
            <Label>Shop Name</Label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputSt} required />
          </div>
          <div>
            <Label>Shop Address</Label>
            <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ ...inputSt, height: 60, resize: 'none' }} required />
          </div>
          <div>
            <Label>Shop Location</Label>
            <div style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <MapPicker
                selected={form.lat != null && form.lng != null ? {
                  lat: Number(form.lat),
                  lng: Number(form.lng),
                  address: form.address || 'Selected location',
                } : null}
                onLocationSelect={handleMapSelect}
              />
            </div>
            {form.lat != null && form.lng != null && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.text3 }}>
                Coordinates: {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>Open Time</Label>
              <select value={form.openTime} onChange={e => setForm({ ...form, openTime: Number(e.target.value) })} style={inputSt}>
                {Array.from({ length: 13 }).map((_, i) => {
                  const m = (8 + i) * 60;
                  return <option key={m} value={m}>{minsToLabel(m)}</option>;
                })}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <Label>Close Time</Label>
              <select value={form.closeTime} onChange={e => setForm({ ...form, closeTime: Number(e.target.value) })} style={inputSt}>
                {Array.from({ length: 13 }).map((_, i) => {
                  const m = (17 + i) * 60;
                  return <option key={m} value={m}>{minsToLabel(m)}</option>;
                })}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginTop: '0.25rem' }}>Services</div>
          <div>
            <Label>Services</Label>
            {loadingShop ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Loading services...</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>
                  Based on {form.genderServed === 'Unisex' ? 'Unisex' : form.genderServed} shop services.
                </div>
                <div className="services-grid">
                  {getCatalogServicesForShopGender(form.genderServed).map((service) => (
                    <ServiceCheckbox
                      key={service.id}
                      service={service}
                      checked={selectedServiceIds.includes(service.id)}
                      onChange={() => setSelectedServiceIds((prev) =>
                        prev.includes(service.id)
                          ? prev.filter((id) => id !== service.id)
                          : [...prev, service.id]
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginTop: '0.25rem' }}>Barbers</div>
          <div>
            <Label>Joined Barbers</Label>
            {loadingBarbers ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Loading barbers...</div>
            ) : shopBarbers.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text3, padding: '0.75rem', borderRadius: 10, background: '#f8fafc', border: `1px solid ${C.border}` }}>
                No joined barbers yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shopBarbers.map((barber) => (
                  <div
                    key={barber._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '0.75rem',
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{barber.name}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{barber.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBarber(barber._id)}
                      disabled={removingBarberId === barber._id}
                      style={{
                        flexShrink: 0,
                        padding: '0.45rem 0.7rem',
                        borderRadius: 8,
                        border: '1px solid #fca5a5',
                        background: '#fee2e2',
                        color: '#dc2626',
                        cursor: removingBarberId === barber._id ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'Poppins',sans-serif",
                      }}
                    >
                      {removingBarberId === barber._id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
            <button type="submit" disabled={busy || loadingShop || selectedServiceIds.length === 0} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${C.teal},${C.tealD})`, color: '#fff', cursor: busy || loadingShop || selectedServiceIds.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   BARBER DASHBOARD
════════════════════════════════════════════════════════════════ */
const BarberDashboard = () => {
  const cachedBarberProfile = getBarberProfileCache();
  const [selectedDate, setSelectedDate] = useState(DATE_PILLS[0]);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [schedulesByDate, setSchedulesByDate] = useState({});
  const [bookings, setBookings] = useState({});
  const [blockDate, setBlockDate] = useState(TODAY);
  const [blockStart, setBlockStart] = useState('09:00');
  const [blockEnd, setBlockEnd] = useState('10:00');
  const [toast, setToast] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [slotTimer, setSlotTimer] = useState(60);
  const [timerExpired, setTimerExpired] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editShopOpen, setEditShopOpen] = useState(false);
  const [user, setUser] = useState({
    name: cachedBarberProfile?.name || 'Barber',
    id: cachedBarberProfile?.id || null,
    barberId: cachedBarberProfile?.barberId || cachedBarberProfile?.id || null,
    role: cachedBarberProfile?.role || 'barber',
    homeServiceBarber: Boolean(cachedBarberProfile?.homeServiceBarber),
    isHomeServiceActive: Boolean(cachedBarberProfile?.isHomeServiceActive),
    shopName: cachedBarberProfile?.shopName || '',
    shopAddress: cachedBarberProfile?.shopAddress || '',
    shopCity: cachedBarberProfile?.shopCity || '',
    shopState: cachedBarberProfile?.shopState || '',
    shopLat: cachedBarberProfile?.shopLat ?? null,
    shopLng: cachedBarberProfile?.shopLng ?? null,
    shopCode: cachedBarberProfile?.shopCode || '',
    openTime: cachedBarberProfile?.openTime ?? 540,
    closeTime: cachedBarberProfile?.closeTime ?? 1260,
    generalWorkStart: cachedBarberProfile?.generalWorkStart ?? DEFAULT_BARBER_WORK_START,
    generalWorkEnd: cachedBarberProfile?.generalWorkEnd ?? DEFAULT_BARBER_WORK_END,
    generalBreaks: Array.isArray(cachedBarberProfile?.generalBreaks) ? cachedBarberProfile.generalBreaks : [],
  });
  const [viewingLocation, setViewingLocation] = useState(null);

  const navigate = useNavigate();
  const getScheduleForDate = useCallback(
    (date) => schedulesByDate[date] || getDefaultBarberSchedule(user),
    [schedulesByDate, user]
  );

  // Fetch barber profile from backend API on mount
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      const token = getBarberToken();
      if (!token) return;
      try {
        const res = await apiRequest('/auth/barber/me', { method: 'GET', auth: 'barber' });
        if (!cancelled && res?.data) {
          setUser(res.data);
          setBarberProfileCache(res.data);
        }
      } catch (err) {
        console.error('Failed to load barber profile:', err);
        if (err.status === 401) {
          setBarberToken(null);
          setBarberProfileCache(null);
          localStorage.removeItem('barber_user');
          window.location.href = '/auth/barber';
          return;
        }
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  const bookingsRequestIdRef = useRef(0);

  const loadDateSchedule = useCallback(async (date, currentBarberId) => {
    try {
      const res = await apiRequest(`/schedule/my?date=${encodeURIComponent(date)}`, {
        method: 'GET',
        auth: 'barber',
      });

      const schedule = res.data?.schedule;
      const list = (res.data?.bookings || []).filter((bk) => {
        if (!currentBarberId) return true;
        const bid = bk.barberId?._id || bk.barberId;
        return String(bid) === String(currentBarberId);
      });

      return {
        date,
        schedule,
        items: list.map((bk, idx) => ({
          id: bk._id,
          apiBookingId: bk._id,
          customer: bk.customerId?.name || 'Customer',
          service: bk.serviceName,
          startMins: bk.slotStartMinutes,
          endMins: bk.effectiveSlotEndMinutes ?? bk.slotEndMinutes,
          timeLabel: bk.slotTimeStr,
          avatarColor: AV[idx % AV.length],
          isHomeVisit: bk.bookingType === 'homevisit',
          homeLocation: bk.homeLocation,
          status: bk.status,
          priceTotal: bk.priceTotal,
          bookingCode: bk.bookingCode,
          verificationCode: bk.verificationCode,
        })),
      };
    } catch (err) {
      console.error('Error loading data for date:', date, err);
      return { date, items: [], schedule: null };
    }
  }, []);

  const applyLoadedSchedule = useCallback((result, requestId) => {
    if (!result || requestId !== bookingsRequestIdRef.current) {
      return;
    }

    const { date, items, schedule } = result;

    setBookings((prev) => ({
      ...prev,
      [date]: items,
    }));

    setSchedulesByDate((prev) => ({
      ...prev,
      [date]: schedule || null,
    }));

    setBlockedSlots((prev) => {
      const next = prev.filter((item) => item.date !== date);

      if (schedule?.breaks) {
        schedule.breaks.forEach((b) => {
          next.push({
            id: `${date}-${b.breakStart}`,
            date,
            startMins: b.breakStart,
            endMins: b.breakEnd,
            startLabel: minsToLabel(b.breakStart),
            endLabel: minsToLabel(b.breakEnd),
          });
        });
      }

      return next.sort((a, b) => a.date.localeCompare(b.date) || a.startMins - b.startMins);
    });
  }, []);

  const loadBookings = useCallback(async () => {
    const token = getBarberToken();
    if (!token) return;

    const currentBarberId = user.barberId || user.id || null;
    const requestId = bookingsRequestIdRef.current + 1;
    bookingsRequestIdRef.current = requestId;

    const orderedDates = [...new Set([selectedDate.str, TODAY, ...DATE_PILLS.map((d) => d.str)])];
    const [firstDate, ...remainingDates] = orderedDates;

    const firstResult = await loadDateSchedule(firstDate, currentBarberId);
    applyLoadedSchedule(firstResult, requestId);

    void Promise.all(
      remainingDates.map((date) => loadDateSchedule(date, currentBarberId))
    ).then((results) => {
      results.forEach((result) => applyLoadedSchedule(result, requestId));
    });
  }, [applyLoadedSchedule, loadDateSchedule, selectedDate.str, user.barberId, user.id]);

  useEffect(() => {
    loadBookings();
    window.addEventListener('bmc_bookings_update', loadBookings);
    const mapHandler = (e) => setViewingLocation(e.detail);
    window.addEventListener('open_map', mapHandler);
    const refreshInterval = setInterval(loadBookings, 10000);

    return () => {
      window.removeEventListener('bmc_bookings_update', loadBookings);
      window.removeEventListener('open_map', mapHandler);
      clearInterval(refreshInterval);
    };
  }, [loadBookings]);

  const currentBooking = (bookings[TODAY] || []).find(b => {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return b.status === 'upcoming' && now >= b.startMins && now <= b.endMins;
  });
  const lastBookingId = useRef(null);

  /* Auto-dismiss toast */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* Slot countdown — resets whenever the active booking changes */
  useEffect(() => {
    if (currentBooking?.id !== lastBookingId.current) {
      lastBookingId.current = currentBooking?.id;
      setCheckedIn(false);
    }
  }, [currentBooking?.id]);

  useEffect(() => {
    if (!currentBooking) {
      setSlotTimer(CURRENT_CUSTOMER_BUFFER_SECONDS);
      setTimerExpired(false);
      return;
    }

    if (checkedIn) return;

    const syncTimer = () => {
      const remaining = getCurrentCustomerTimerRemaining(currentBooking);
      setSlotTimer(remaining);
      setTimerExpired(remaining <= 0);
    };

    syncTimer();
    const iv = setInterval(syncTimer, 1000);
    return () => clearInterval(iv);
  }, [currentBooking?.id, currentBooking?.startMins, checkedIn]);

  /* Block slot */
  const handleBlock = async () => {
    const sM = timeStrToMins(blockStart);
    const eM = timeStrToMins(blockEnd);
    if (isTuesdayDateStr(blockDate)) { setToast({ message: '❌ Shop is closed on Tuesday', type: 'error' }); return; }
    if (!blockStart || !blockEnd) { setToast({ message: '❌ Select start and end times', type: 'error' }); return; }
    if (eM <= sM) { setToast({ message: '❌ End time must be after start time', type: 'error' }); return; }
    if (sM < OPEN || eM > CLOSE) { setToast({ message: '❌ Times must be within 7:00 AM – 11:00 PM', type: 'error' }); return; }
    for (const b of (bookings[blockDate] || []))
      if (sM < b.endMins && eM > b.startMins) { setToast({ message: '❌ Cannot block an already booked slot', type: 'error' }); return; }
    for (const b of (getScheduleForDate(blockDate)?.breaks || []))
      if (sM < b.breakEnd && eM > b.breakStart) { setToast({ message: '❌ This time is already blocked', type: 'error' }); return; }

    try {
      // Fetch current schedule for the date
      const res = await apiRequest(`/schedule/my?date=${blockDate}`, { method: 'GET', auth: 'barber' });
      const currentSchedule = res.data?.schedule || getScheduleForDate(blockDate);

      const newBreaks = (currentSchedule?.breaks || []).map(b => ({ breakStart: b.breakStart, breakEnd: b.breakEnd }));
      newBreaks.push({ breakStart: sM, breakEnd: eM });

      await apiRequest('/schedule/setup', {
        method: 'POST',
        auth: 'barber',
        body: {
          date: blockDate,
          workStart: currentSchedule?.workStart ?? DEFAULT_BARBER_WORK_START,
          workEnd: currentSchedule?.workEnd ?? DEFAULT_BARBER_WORK_END,
          breaks: newBreaks,
          isHomeServiceDay: currentSchedule?.isHomeServiceDay || false,
        }
      });

      setToast({ message: '✅ Slot blocked successfully', type: 'success' });
      loadBookings(); // Now in scope
    } catch (err) {
      setToast({ message: err.message || 'Failed to block slot', type: 'error' });
    }
  };

  const handleRemoveBlock = async (block) => {
    try {
      const res = await apiRequest(`/schedule/my?date=${block.date}`, { method: 'GET', auth: 'barber' });
      const currentSchedule = res.data?.schedule || getScheduleForDate(block.date);

      const newBreaks = (currentSchedule?.breaks || [])
        .filter(b => b.breakStart !== block.startMins || b.breakEnd !== block.endMins)
        .map(b => ({ breakStart: b.breakStart, breakEnd: b.breakEnd }));

      await apiRequest('/schedule/setup', {
        method: 'POST',
        auth: 'barber',
        body: {
          date: block.date,
          workStart: currentSchedule?.workStart ?? DEFAULT_BARBER_WORK_START,
          workEnd: currentSchedule?.workEnd ?? DEFAULT_BARBER_WORK_END,
          breaks: newBreaks,
          isHomeServiceDay: currentSchedule?.isHomeServiceDay || false,
        }
      });

      setToast({ message: '✅ Block removed', type: 'success' });
      loadBookings(); // Now in scope
    } catch (err) {
      setToast({ message: err.message || 'Failed to remove block', type: 'error' });
    }
  };

  // Pre-fill block form from the active booking slot
  const handleBlockFromCurrent = () => {
    if (!currentBooking) return;
    setBlockDate(TODAY);
    setBlockStart(minsToTimeStr(currentBooking.startMins));
    setBlockEnd(minsToTimeStr(currentBooking.endMins));
    setToast({ message: '📋 Block form pre-filled from active slot', type: 'success' });
  };

  // Cancel the currently active booking
  const cancelCurrentBooking = () => {
    if (!currentBooking) return;
    setBookings(prev => {
      const u = {};
      for (const [d, bs] of Object.entries(prev)) u[d] = bs.filter(b => b.id !== currentBooking.id);
      return u;
    });
    setSlotTimer(60);
    setTimerExpired(false);
    setToast({ message: '✅ Booking cancelled', type: 'success' });
  };

  const cancelBooking = (id) => {
    setBookings(prev => {
      const u = {};
      for (const [d, bs] of Object.entries(prev)) u[d] = bs.filter(b => b.id !== id);
      return u;
    });
    setToast({ message: '✅ Booking cancelled', type: 'success' });
  };

  const cancelCurrentBookingApi = async () => {
    if (!currentBooking?.apiBookingId) return;
    try {
      await apiRequest(`/bookings/${currentBooking.apiBookingId}/barber-cancel`, {
        method: 'PUT',
        auth: 'barber',
        body: { cancellationReason: 'Cancelled by barber from dashboard' },
      });
      setSlotTimer(60);
      setTimerExpired(false);
      loadBookings();
      setToast({ message: '✅ Booking cancelled', type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Failed to cancel booking', type: 'error' });
    }
  };

  const todayBookings = bookings[TODAY] || [];
  const completedToday = todayBookings.filter(b => b.status === 'completed');
  const totalEarningsToday = todayBookings.reduce((sum, b) => b.status === 'completed' ? sum + (b.priceTotal || 0) : sum, 0);
  const selectedSchedule = getScheduleForDate(selectedDate.str);
  const todayBlockCount = blockedSlots.filter(b => b.date === TODAY).length;
  const panelBlockedList = blockedSlots.filter(b => b.date === blockDate);
  const rawUpcoming = (bookings[selectedDate.str] || []).filter((booking) => booking.status === 'upcoming');
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const upcoming = selectedDate.str === TODAY
    ? rawUpcoming.filter(b => b.startMins > nowMins)
    : rawUpcoming;
  const upcomingCount = upcoming.length;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Poppins',sans-serif" }}>
      <style>{STYLE}</style>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ══════ HEADER ══════ */}
      <header style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '0 1.5rem', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Left: Logo */}
          <BrandLogo
            size={34}
            textStyle={{ fontWeight: 800, fontSize: 17, color: C.text, letterSpacing: '-0.02em' }}
            containerStyle={{ flexShrink: 0 }}
          />

          {/* Center: Shop name */}
          <div style={{ textAlign: 'center', flex: 1, padding: '0 1rem' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{user.shopName || 'Your Shop'} <span style={{ fontSize: 11, background: C.bg, padding: '2px 6px', borderRadius: 4, color: C.teal, border: `1px solid ${C.border}` }}>{user.shopCode}</span></div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>{user.shopCity && user.shopState ? `${user.shopCity}, ${user.shopState}` : (user.shopAddress || 'Address not set')}</div>
          </div>

          {/* Right: Barber name + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, position: 'relative' }}>
            {user.homeServiceBarber && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRight: `1px solid ${C.border}`, paddingRight: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Home Service: {user.isHomeServiceActive ? 'ON' : 'OFF'}</label>
                <div
                  onClick={async () => {
                    const nu = { ...user, isHomeServiceActive: !user.isHomeServiceActive };
                    if (getBarberToken()) {
                      try {
                        await apiRequest('/barbers/home-toggle', {
                          method: 'PUT',
                          auth: 'barber',
                          body: { isAccepting: nu.isHomeServiceActive },
                        });
                      } catch (err) {
                        setToast({ message: err.message || 'Could not update home service', type: 'error' });
                        return;
                      }
                    }
                    setUser(nu);
                    setBarberProfileCache(nu);
                  }}
                  style={{
                    width: 36, height: 20, borderRadius: 10, background: user.isHomeServiceActive ? C.teal : '#cbd5e1',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: user.isHomeServiceActive ? 18 : 2, width: 16, height: 16,
                    background: C.white, borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </div>
              </div>
            )}
            <span style={{ fontSize: 12, color: C.text2 }}>Welcome, <strong style={{ color: C.text }}>{user.name}</strong></span>
            <button
              onClick={() => setProfileOpen(p => !p)}
              style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg,${C.teal},${C.tealD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {user.name.charAt(0).toUpperCase()}
            </button>
            <BarberProfileDropdown
              open={profileOpen}
              onClose={() => setProfileOpen(false)}
              user={user}
              onEditProfile={() => setEditProfileOpen(true)}
              onEditShop={() => setEditShopOpen(true)}
            />
          </div>
        </div>
      </header>

      <EditProfileModal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        user={user}
        onSave={(updated) => {
          const nu = { ...user, ...updated };
          setUser(nu);
          setBarberProfileCache(nu);
          setToast({ message: '✅ Profile updated', type: 'success' });
        }}
      />
      <EditShopModal
        open={editShopOpen}
        onClose={() => setEditShopOpen(false)}
        user={user}
        onSave={(updated) => {
          const nu = {
            ...user,
            shopName: updated.name,
            shopAddress: updated.location?.address || user.shopAddress,
            shopCity: updated.location?.city || updated.city || user.shopCity,
            shopState: updated.location?.state || updated.state || user.shopState,
            shopLat: updated.location?.coordinates?.[1] ?? user.shopLat,
            shopLng: updated.location?.coordinates?.[0] ?? user.shopLng,
            openTime: updated.openTime,
            closeTime: updated.closeTime
          };
          setUser(nu);
          setBarberProfileCache(nu);
          setToast({ message: '✅ Shop details updated', type: 'success' });
        }}
      />

      {/* ══════ CONTENT ══════ */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ marginBottom: '1.2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>📊 Barber Dashboard</h1>
          <p style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>Manage your schedule, block slots, and track bookings</p>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="bdb-stat-grid" style={{ marginBottom: '1.5rem' }}>
          <StatCard icon="📅" title="Total Bookings Today" value={String(todayBookings.length)} trend={`Completed: ${completedToday.length}`} />
          <StatCard icon="⏰" title="Upcoming Appointments" value={String(upcomingCount)} trend="Next: Check timeline" />
          <StatCard icon="🚫" title="Blocked Slots" value={String(todayBlockCount)} trend="For today" />
          <StatCard icon="💰" title="Earnings Today" value={`₹${totalEarningsToday}`} trend="From completed bookings" />
        </div>

        {/* ── SPLIT LAYOUT ── */}
        <div className="bdb-split">

          {/* ════ LEFT: Block Time Slot ════ */}
          <div className="bdb-left" style={{ background: C.white, borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: `1px solid ${C.border}` }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 7 }}>
              🚫 Block Time Slot
            </h2>

            {/* Date */}
            <div style={{ marginBottom: '0.75rem' }}>
              <Label>Date</Label>
              <input type="date" min={TODAY} max={getDs(3)} value={blockDate}
                onChange={e => setBlockDate(e.target.value)} style={inputSt} />
            </div>

            {/* Start Time — continuous (any minute) */}
            <div style={{ marginBottom: '0.75rem' }}>
              <Label>Start Time</Label>
              <input type="time" min="07:00" max="23:00" value={blockStart}
                onChange={e => setBlockStart(e.target.value)} style={inputSt} />
              <div style={{ fontSize: 10, color: C.text3, marginTop: 3 }}>Visible chart: 7:00 AM – 11:00 PM</div>
            </div>

            {/* End Time — continuous (any minute) */}
            <div style={{ marginBottom: '1rem' }}>
              <Label>End Time</Label>
              <input type="time" min="07:00" max="23:00" value={blockEnd}
                onChange={e => setBlockEnd(e.target.value)} style={inputSt} />
            </div>

            {/* Block button */}
            <button onClick={handleBlock} style={{
              width: '100%', padding: '0.62rem', borderRadius: 9,
              background: `linear-gradient(135deg,${C.teal},${C.tealD})`,
              color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
              fontFamily: "'Poppins',sans-serif", marginBottom: '1rem', transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              🚫 Block Slot
            </button>

            {/* Blocked list for selected block date */}
            {panelBlockedList.length > 0 && (
              <div>
                <Label>Blocked — {blockDate}</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                  {panelBlockedList.map(b => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fee2e2', borderRadius: 8, padding: '0.38rem 0.6rem', border: '1px solid #fca5a5' }}>
                      <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 500 }}>{b.startLabel} – {b.endLabel}</span>
                      <button onClick={() => handleRemoveBlock(b)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, lineHeight: 1, fontFamily: 'inherit', padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ════ RIGHT ════ */}
          <div className="bdb-right" style={{ background: C.white, borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* A: Date Pills — Today + 3 days */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DATE_PILLS.map(d => {
                const sel = d.str === selectedDate.str;
                return (
                  <button key={d.str} onClick={() => setSelectedDate(d)} style={{
                    padding: '0.42rem 1.1rem', borderRadius: 50,
                    border: `1.5px solid ${sel ? C.teal : C.border}`,
                    background: sel ? C.teal : C.white, color: sel ? '#fff' : C.text2,
                    fontWeight: sel ? 700 : 400, fontSize: 12, cursor: 'pointer',
                    fontFamily: "'Poppins',sans-serif", transition: 'all 0.15s',
                  }}>{d.label}</button>
                );
              })}
            </div>

            {/* B: Continuous Timeline */}
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                🗓 Schedule —{' '}
                <span style={{ color: C.text2, fontWeight: 400 }}>{selectedDate.label}</span>
              </h3>
              <ContinuousTimeline
                bookings={bookings}
                blockedSlots={blockedSlots}
                schedule={selectedSchedule}
                date={selectedDate.str}
              />
            </div>

            {/* ── Current Customer ── */}
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: '0.7rem', display: 'flex', alignItems: 'center', gap: 7 }}>
                🪑 Current Customer
                {currentBooking && (
                  <span style={{ background: 'rgba(255,122,0,0.12)', color: '#c2410c', fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '1px 8px', border: '1px solid rgba(255,122,0,0.25)' }}>ACTIVE</span>
                )}
              </h3>
              {currentBooking ? (
                <div style={{ background: 'rgba(255,122,0,0.06)', border: '1px solid rgba(255,122,0,0.18)', borderRadius: 10, padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.65rem' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: currentBooking.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                      {currentBooking.customer[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{currentBooking.customer}</span>
                        {currentBooking.verificationCode && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: C.teal, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.15em', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            PIN: {currentBooking.verificationCode}
                          </span>
                        )}
                        {currentBooking.isHomeVisit && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#ec4899', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.05em' }}>
                            🏠 Home Visit
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: C.text3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {currentBooking.service}
                        {currentBooking.isHomeVisit && currentBooking.homeLocation && (
                          <button
                            onClick={() => openDirectionsFromCurrentLocation(currentBooking.homeLocation)}
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.teal}33`, background: C.white, cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <FaMapMarkerAlt /> View Location
                          </button>
                        )}
                      </div>
                    </div>
                    <span style={{ background: C.tealL, color: C.teal, fontWeight: 700, fontSize: 10, borderRadius: 20, padding: '2px 9px', border: `1px solid ${C.teal}33`, flexShrink: 0 }}>
                      {currentBooking.timeLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                    {/* Check In */}
                    <button
                      onClick={async () => {
                        if (checkedIn || !currentBooking?.apiBookingId) return;
                        try {
                          await apiRequest(`/bookings/${currentBooking.apiBookingId}/check-in`, {
                            method: 'PUT',
                            auth: 'barber',
                          });
                          setCheckedIn(true);
                          // Trigger reload of bookings to update stats
                          window.dispatchEvent(new Event('bmc_bookings_update'));
                          setToast({ message: '✅ Check-in successful', type: 'success' });
                        } catch (err) {
                          setToast({ message: err.message || 'Check-in failed', type: 'error' });
                        }
                      }}
                      style={{
                        flex: 1, padding: '0.48rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                        background: checkedIn ? 'rgba(255,122,0,0.12)' : `linear-gradient(135deg,${C.teal},${C.tealD})`,
                        color: checkedIn ? '#c2410c' : '#fff',
                      }}
                    >
                      {checkedIn ? '✓ Checked In' : 'Check In'}
                    </button>

                    {/* Timer box OR expired action buttons */}
                    {!timerExpired ? (
                      <div style={{
                        background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
                        padding: '0.48rem 0.7rem', fontSize: 12, fontWeight: 700, color: '#dc2626',
                        flexShrink: 0, minWidth: 52, textAlign: 'center',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {`0:${String(slotTimer).padStart(2, '0')}`}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={handleBlockFromCurrent}
                          style={{
                            flex: 1, padding: '0.48rem 0.4rem', borderRadius: 8,
                            border: `1px solid ${C.border}`, background: '#f8fafc',
                            color: C.text2, fontWeight: 600, fontSize: 11,
                            cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
                          }}
                        >Block Slot</button>
                        <button
                          onClick={cancelCurrentBookingApi}
                          style={{
                            flex: 1, padding: '0.48rem 0.4rem', borderRadius: 8,
                            border: '1px solid #fca5a5', background: '#fee2e2',
                            color: '#dc2626', fontWeight: 600, fontSize: 11,
                            cursor: 'pointer', fontFamily: "'Poppins',sans-serif",
                          }}
                        >Cancel Booking</button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '0.65rem 0.85rem', borderRadius: 10, background: '#f8fafc', border: `1px solid ${C.border}`, fontSize: 12, color: C.text3, textAlign: 'center' }}>
                  No active booking right now
                </div>
              )}
            </div>

            {/* C: Upcoming Customers */}
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: '0.7rem', display: 'flex', alignItems: 'center', gap: 7 }}>
                👥 Upcoming Customers
                <span style={{ background: `${C.teal}18`, color: C.teal, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '1px 8px', border: `1px solid ${C.teal}33` }}>
                  {upcoming.length}
                </span>
              </h3>
              <div className="bdb-scroll">
                {upcoming.length === 0
                  ? <div style={{ textAlign: 'center', padding: '2rem', color: C.text3, fontSize: 12 }}>No bookings for this date</div>
                  : upcoming.map(b => <BookingCard key={b.id} booking={b} />)
                }
              </div>
            </div>

          </div>{/* end right */}
        </div>{/* end split */}
      </main>
    </div>
  );
};

export default BarberDashboard;
