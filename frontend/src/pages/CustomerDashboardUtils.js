import { getLocalDateStr, getLocalDateWithOffset, isTuesdayDateStr } from '../utils/date';

export const T_FALLBACK = {
  bg: '#f8f7f4', surface: '#ffffff', s2: '#f1f0ec', s3: '#e8e7e3',
  br: '#e5e4df', br2: '#d0cfc9',
  text: '#1a1915', text2: '#5a5852', text3: '#9b9890',
  gold: '#0d9488', green: '#5a9e6f', amber: '#c97c2e',
};
export const T = T_FALLBACK; // kept for components that import T directly
export const SHOP_CARD_MIN_HEIGHT = 250;
export const BOOKING_CARD_MIN_HEIGHT = 170;
export const CUSTOMER_TIMELINE_OPEN = 7 * 60;
export const CUSTOMER_TIMELINE_CLOSE = 23 * 60;
export const ONE_LINE_ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
export const TWO_LINE_CLAMP = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

export const pct = (m, open, total) => `${((m - open) / total * 100).toFixed(3)}%`;
export const pctW = (d, total) => `${(d / total * 100).toFixed(3)}%`;
export const fmtTime = (mins) => {
  if (mins == null) return '--';
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
};
export const getDateStr = (offset = 0) => getLocalDateStr(offset);
export const getDayLabel = (offset) => {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const d = getLocalDateWithOffset(offset);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
export const DATES = [0, 1, 2, 3].map(o => ({ offset: o, str: getDateStr(o), label: getDayLabel(o) }));
export const INITIAL_BOOKING_DATE = DATES.find((date) => !isTuesdayDateStr(date.str)) || DATES[0];
export const CURRENT_CUSTOMER_BUFFER_SECONDS = 60;
export const AUTO_CANCEL_BUFFER_SECONDS = 60;
