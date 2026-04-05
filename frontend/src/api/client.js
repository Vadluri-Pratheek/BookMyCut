import { getLocalDateStr } from '../utils/date';

const getBase = () =>
  (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export const STORAGE = {
  customerToken: 'bookmycut_customer_token',
  barberToken: 'bookmycut_barber_token',
  customerProfile: 'bookmycut_customer_profile',
  barberProfile: 'bookmycut_barber_profile',
};

const getStoredJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    localStorage.removeItem(key);
    return null;
  }
};

const setStoredJson = (key, value) => {
  if (value) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  localStorage.removeItem(key);
};

export function getCustomerToken() {
  return localStorage.getItem(STORAGE.customerToken);
}

export function setCustomerToken(token) {
  if (token) localStorage.setItem(STORAGE.customerToken, token);
  else localStorage.removeItem(STORAGE.customerToken);
}

export function getCustomerProfileCache() {
  return getStoredJson(STORAGE.customerProfile);
}

export function setCustomerProfileCache(profile) {
  setStoredJson(STORAGE.customerProfile, profile);
}

export function getBarberToken() {
  return localStorage.getItem(STORAGE.barberToken);
}

export function setBarberToken(token) {
  if (token) localStorage.setItem(STORAGE.barberToken, token);
  else localStorage.removeItem(STORAGE.barberToken);
}

export function getBarberProfileCache() {
  return getStoredJson(STORAGE.barberProfile);
}

export function setBarberProfileCache(profile) {
  setStoredJson(STORAGE.barberProfile, profile);
}

/**
 * @param {string} path - e.g. '/auth/customer/login'
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method]
 * @param {object} [options.body] - JSON body
 * @param {'customer'|'barber'|'none'} [options.auth] - default 'none'
 */
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, auth = 'none', headers: extraHeaders = {} } = options;
  const url = `${getBase()}${path.startsWith('/') ? path : `/${path}`}`;

  let authorization = {};
  if (auth === 'customer') {
    const t = getCustomerToken();
    if (t) authorization = { Authorization: `Bearer ${t}` };
  } else if (auth === 'barber') {
    const t = getBarberToken();
    if (t) authorization = { Authorization: `Bearer ${t}` };
  }

  const headers = {
    ...authorization,
    ...extraHeaders,
  };

  if (body != null && method !== 'GET' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const err = new Error(
      `Unable to reach the API server at ${getBase()}. Make sure the backend is running and VITE_API_BASE_URL is correct.`
    );
    err.cause = error;
    err.isNetworkError = true;
    throw err;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { success: false, message: text || 'Invalid response from server' };
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const getDateStr = (offset = 0) => getLocalDateStr(offset);

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

/** Seeds default working hours for the next `days` days (barber must be logged in). */
export async function seedBarberScheduleForUpcomingDays(days = 4) {
  let defaultSchedule = {
    workStart: 540,
    workEnd: 1260,
    breaks: [],
  };

  try {
    const profile = await apiRequest('/auth/barber/me', {
      method: 'GET',
      auth: 'barber',
    });

    if (profile?.data) {
      defaultSchedule = {
        workStart: Number(profile.data.generalWorkStart ?? 540),
        workEnd: Number(profile.data.generalWorkEnd ?? 1260),
        breaks: normalizeScheduleBreaks(profile.data.generalBreaks),
      };
    }
  } catch (_) {
    /* fall back to legacy defaults */
  }

  const tasks = [];
  for (let i = 0; i < days; i++) {
    const date = getDateStr(i);
    tasks.push((async () => {
      const existing = await apiRequest(`/schedule/my?date=${encodeURIComponent(date)}`, {
        method: 'GET',
        auth: 'barber',
      });

      if (existing?.data?.schedule) {
        return existing.data.schedule;
      }

      return apiRequest('/schedule/setup', {
        method: 'POST',
        auth: 'barber',
        body: {
          date,
          workStart: defaultSchedule.workStart,
          workEnd: defaultSchedule.workEnd,
          breaks: defaultSchedule.breaks,
        },
      });
    })());
  }
  await Promise.allSettled(tasks);
}
