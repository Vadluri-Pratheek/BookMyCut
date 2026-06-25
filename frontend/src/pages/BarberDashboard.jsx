import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  apiRequest,
  getBarberProfileCache,
  getBarberToken,
  setBarberProfileCache,
  setBarberToken,
} from '../api/client';
import { FaMapMarkerAlt, FaCheck, FaTimes } from 'react-icons/fa';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MapPicker from '../components/MapPicker';
import ServiceCheckbox from '../components/ServiceCheckbox';
import { getLocalDateStr, getLocalDateWithOffset, isTuesdayDateStr } from '../utils/date';
import {
  STYLE, C_FALLBACK, C, BOOKING_SYNC_STORAGE_KEY, BOOKING_SYNC_EVENT_NAME,
  OPEN, CLOSE, TOTAL, DEFAULT_BARBER_WORK_START, DEFAULT_BARBER_WORK_END,
  pct, pctW, minsToLabel, timeStrToMins, minsToTimeStr, upiRe, normalizeUpiId,
  normalizeScheduleBreaks, getDefaultBarberSchedule, getVisibleTimelineSegment,
  getVisibleWorkWindow, emitBookingSync, getDs, getDayLbl, DATE_PILLS, TODAY, AV,
  CURRENT_CUSTOMER_BUFFER_SECONDS, getCatalogServicesForShopGender,
  getServiceGenderSpecificForShop, findCatalogServiceForShopService,
  getCurrentCustomerTimerRemaining, inputSt
} from './BarberDashboardUtils';

import { openDirectionsFromCurrentLocation } from '../utils/navigation';
import L from 'leaflet';

import { Toast } from '../components/BarberToast';
import { StatCard } from '../components/BarberStatCard';
import { BookingCard } from '../components/BarberBookingCard';
import { ContinuousTimeline } from '../components/BarberContinuousTimeline';
import { BarberProfileDropdown } from '../components/BarberProfileDropdown';
import { EditShopModal } from '../components/BarberEditShopModal';
import { Label } from '../components/BarberLabel';
import { useBarberTheme } from '../hooks/useTheme';


// Fix Leaflet paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});



const BarberDashboard = () => {
  const C = useBarberTheme();
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
    upiId: cachedBarberProfile?.upiId || '',
    openTime: cachedBarberProfile?.openTime ?? 540,
    closeTime: cachedBarberProfile?.closeTime ?? 1260,
    generalWorkStart: cachedBarberProfile?.generalWorkStart ?? DEFAULT_BARBER_WORK_START,
    generalWorkEnd: cachedBarberProfile?.generalWorkEnd ?? DEFAULT_BARBER_WORK_END,
    generalBreaks: Array.isArray(cachedBarberProfile?.generalBreaks) ? cachedBarberProfile.generalBreaks : [],
  });



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
        const res = await apiRequest('/auth/me', { method: 'GET', auth: 'barber' });
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
    const handleIncomingBookingSync = (payload = {}) => {
      if (payload?.type === 'created' && payload?.dateIso) {
        const matchingDate = DATE_PILLS.find((date) => date.str === payload.dateIso);
        if (matchingDate) {
          setSelectedDate((prev) => (prev.str === matchingDate.str ? prev : matchingDate));
        }
      }
      loadBookings();
    };

    const handleBookingSyncEvent = (event) => {
      handleIncomingBookingSync(event.detail);
    };

    const handleBookingSyncStorage = (event) => {
      if (event.key !== BOOKING_SYNC_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        handleIncomingBookingSync(JSON.parse(event.newValue));
      } catch {
        loadBookings();
      }
    };

    loadBookings();
    window.addEventListener('bmc_bookings_update', loadBookings);
    window.addEventListener(BOOKING_SYNC_EVENT_NAME, handleBookingSyncEvent);
    window.addEventListener('storage', handleBookingSyncStorage);

    const refreshInterval = setInterval(loadBookings, 10000);

    return () => {
      window.removeEventListener('bmc_bookings_update', loadBookings);
      window.removeEventListener(BOOKING_SYNC_EVENT_NAME, handleBookingSyncEvent);
      window.removeEventListener('storage', handleBookingSyncStorage);

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
      emitBookingSync({ type: 'cancelled', bookingId: currentBooking.apiBookingId, dateIso: TODAY });
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
  const visibleCustomerList = selectedDate.str === TODAY && upcoming.length === 0 && currentBooking
    ? [currentBooking]
    : upcoming;
  const upcomingCount = visibleCustomerList.length;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Poppins',sans-serif" }}>
      <style>{STYLE}</style>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ══════ HEADER ══════ */}
      <header style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '0 1.5rem', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Left: Logo Placeholder */}

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
              onEditShop={() => setEditShopOpen(true)}
            />
          </div>
        </div>
      </header>

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

        {}
        <div className="bdb-stat-grid" style={{ marginBottom: '1.5rem' }}>
          <StatCard icon="📅" title="Total Bookings Today" value={String(todayBookings.length)} trend={`Completed: ${completedToday.length}`} />
          <StatCard icon="⏰" title="Upcoming Appointments" value={String(upcomingCount)} trend="Next: Check timeline" />
          <StatCard icon="🚫" title="Blocked Slots" value={String(todayBlockCount)} trend="For today" />
          <StatCard icon="💰" title="Earnings Today" value={`₹${totalEarningsToday}`} trend="From completed bookings" />
        </div>

        {}
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

            {}
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
                          <span className="badge-home">
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
                          emitBookingSync({ type: 'completed', bookingId: currentBooking.apiBookingId, dateIso: TODAY });
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
                  {upcomingCount}
                </span>
              </h3>
              <div className="bdb-scroll">
                {visibleCustomerList.length === 0
                  ? <div style={{ textAlign: 'center', padding: '2rem', color: C.text3, fontSize: 12 }}>No bookings for this date</div>
                  : visibleCustomerList.map(b => <BookingCard key={b.id} booking={b} />)
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
