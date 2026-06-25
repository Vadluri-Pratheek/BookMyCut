import { getLocalDateStr, getLocalDateWithOffset } from '../utils/date';
import { SERVICES } from '../data/services';

export const STYLE = `
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

export const C_FALLBACK = {
  teal: '#ff7a00', tealD: '#ef6400', tealL: '#fff1e5',
  bg: '#f8f7f4', white: '#ffffff', border: '#e5e4df',
  text: '#1a1915', text2: '#5a5852', text3: '#9b9890',
};
export const C = C_FALLBACK;
export const BOOKING_SYNC_STORAGE_KEY = 'bookmycut_booking_sync';
export const BOOKING_SYNC_EVENT_NAME = 'bookmycut_booking_sync';

export const OPEN = 7 * 60;
export const CLOSE = 23 * 60;
export const TOTAL = CLOSE - OPEN;
export const DEFAULT_BARBER_WORK_START = 540;
export const DEFAULT_BARBER_WORK_END = 1260;

export const pct = (m) => `${((m - OPEN) / TOTAL * 100).toFixed(3)}%`;
export const pctW = (d) => `${(d / TOTAL * 100).toFixed(3)}%`;

export const minsToLabel = (m) => {
  const h = Math.floor(m / 60), mn = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${String(mn).padStart(2, '0')} ${ap}`;
};
export const timeStrToMins = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const minsToTimeStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const upiRe = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;
export const normalizeUpiId = (value = '') => String(value).trim().toLowerCase();

export const normalizeScheduleBreaks = (breaks = []) =>
  Array.isArray(breaks)
    ? breaks
      .map((item) => ({
        breakStart: Number(item.breakStart),
        breakEnd: Number(item.breakEnd),
        ...(item.label ? { label: item.label } : {}),
      }))
      .filter((item) => Number.isFinite(item.breakStart) && Number.isFinite(item.breakEnd))
    : [];

export const getDefaultBarberSchedule = (barber) => ({
  workStart: Number.isFinite(Number(barber?.generalWorkStart))
    ? Number(barber.generalWorkStart)
    : DEFAULT_BARBER_WORK_START,
  workEnd: Number.isFinite(Number(barber?.generalWorkEnd))
    ? Number(barber.generalWorkEnd)
    : DEFAULT_BARBER_WORK_END,
  breaks: normalizeScheduleBreaks(barber?.generalBreaks),
});

export const getVisibleTimelineSegment = (startMins, endMins) => {
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

export const getVisibleWorkWindow = (schedule) => {
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

export const emitBookingSync = (payload = {}) => {
  const detail = { ...payload, timestamp: Date.now() };
  try {
    localStorage.setItem(BOOKING_SYNC_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    /* ignore sync persistence issues */
  }
  window.dispatchEvent(new CustomEvent(BOOKING_SYNC_EVENT_NAME, { detail }));
};

export const getDs = (off = 0) => getLocalDateStr(off);
export const getDayLbl = (off) => {
  const d = getLocalDateWithOffset(off);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const DATE_PILLS = [0, 1, 2, 3].map(o => ({ offset: o, str: getDs(o), label: getDayLbl(o) }));
export const TODAY = getDs(0);

export const AV = ['#ff7a00', '#ff9b45', '#f97316', '#ea580c', '#fb923c', '#fdba74'];
export const CURRENT_CUSTOMER_BUFFER_SECONDS = 60;

export const getCatalogServicesForShopGender = (genderServed) => {
  if (genderServed === 'Male') {
    return SERVICES.filter((service) => service.gender === 'male' || service.gender === 'both');
  }
  if (genderServed === 'Female') {
    return SERVICES.filter((service) => service.gender === 'female' || service.gender === 'both');
  }
  return SERVICES;
};

export const getServiceGenderSpecificForShop = (service, genderServed) => {
  if (genderServed === 'Male' || genderServed === 'Female') {
    return genderServed;
  }
  if (service.gender === 'male') return 'Male';
  if (service.gender === 'female') return 'Female';
  return 'Unisex';
};

export const findCatalogServiceForShopService = (shopService, genderServed) => {
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

export const getCurrentCustomerTimerRemaining = (booking) => {
  if (!booking) return CURRENT_CUSTOMER_BUFFER_SECONDS;

  const startDateTime = new Date();
  startDateTime.setHours(Math.floor(booking.startMins / 60), booking.startMins % 60, 0, 0);

  const expiresAt = startDateTime.getTime() + (CURRENT_CUSTOMER_BUFFER_SECONDS * 1000);
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
};

export const inputSt = {
  width: '100%', padding: '0.48rem 0.7rem', borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13, color: C.text,
  fontFamily: "'Poppins',sans-serif", outline: 'none',
  background: C.white, boxSizing: 'border-box',
};
