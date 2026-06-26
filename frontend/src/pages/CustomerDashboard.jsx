import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaSearch, FaStar, FaMapMarkerAlt, FaClock, FaArrowLeft, FaCheck, FaCrosshairs } from 'react-icons/fa';
import { FaScissors, FaUser, FaChevronDown, FaXmark, FaCalendarDays } from 'react-icons/fa6';
import {
  apiRequest,
  getCustomerProfileCache,
  getCustomerToken,
  setCustomerProfileCache,
  setCustomerToken,
} from '../api/client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { getLocalDateStr, getLocalDateWithOffset, isTuesdayDateStr } from '../utils/date';
import { getCurrentBrowserLocation, normalizeLocation } from '../utils/location';
import { openDirectionsFromCurrentLocation } from '../utils/navigation';
import L from 'leaflet';

import { ClickHandler } from '../components/CustomerMapClickHandler';
import { ActionNotice } from '../components/CustomerActionNotice';
import { Stars } from '../components/CustomerStars';
import { ContinuousTimeline } from '../components/CustomerContinuousTimeline';
import { ShopCard } from '../components/CustomerShopCard';
import { ProfileDropdown } from '../components/CustomerProfileDropdown';
import { CustomerAuthModal } from '../components/CustomerAuthModal';
import { useTheme } from '../hooks/useTheme';

// Fix Leaflet default icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

import {
  T_FALLBACK, T, SHOP_CARD_MIN_HEIGHT, BOOKING_CARD_MIN_HEIGHT, CUSTOMER_TIMELINE_OPEN,
  CUSTOMER_TIMELINE_CLOSE, ONE_LINE_ELLIPSIS, TWO_LINE_CLAMP, pct, pctW, fmtTime, getDateStr,
  getDayLabel, DATES, INITIAL_BOOKING_DATE, CURRENT_CUSTOMER_BUFFER_SECONDS, AUTO_CANCEL_BUFFER_SECONDS
} from './CustomerDashboardUtils';
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
  } catch {
    /* ignore sync persistence issues */
  }
  window.dispatchEvent(new CustomEvent(BOOKING_SYNC_EVENT_NAME, { detail }));
};

const formatServiceNames = (services = []) => services.map((service) => service.name).join(', ');


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

const sortCustomerBookings = (bookings = []) => (
  [...bookings].sort((a, b) => {
    if (a.dateIso !== b.dateIso) {
      return String(b.dateIso || '').localeCompare(String(a.dateIso || ''));
    }

    return Number(b.slotStartMinutes || 0) - Number(a.slotStartMinutes || 0);
  })
);

const DashboardPage = ({ onBook, refreshKey = 0, recentBooking = null }) => {
  const T = useTheme();
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
    homeLocation: normalizeLocation(cachedCustomerProfile?.homeLocation) || null,
  });
  const [userLoading, setUserLoading] = useState(!cachedCustomerProfile);
  const [filterGender, setFilterGender] = useState('Male');
  const [showAuthModal, setShowAuthModal] = useState(false);
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
        const res = await apiRequest('/auth/me', { method: 'GET', auth: 'customer' });
        if (!cancelled && res?.data) {
          const nextUser = {
            name: res.data.name || '',
            email: res.data.email || '',
            phone: res.data.phone || '',
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
      setUserLocation(location);

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
          } catch { /* ignore invalid JWT */ }
        }

        const gender = filterGender || 'Male';
        const savedHomeLocation = normalizeLocation(user.homeLocation);
        const searchLocation = savedHomeLocation || userLocation || null;
        const fetchKey = JSON.stringify({
          gender,
          lat: searchLocation?.lat ?? null,
          lng: searchLocation?.lng ?? null,
        });

        if (fetchKey === shopsFetchKeyRef.current && hasLoadedShopsRef.current) {
          return;
        }

        setLoadingShops(!hasLoadedShopsRef.current);

        let shopRows = [];

        if (searchLocation?.lng != null && searchLocation?.lat != null) {
          const nearbyParams = new URLSearchParams({ gender });
          nearbyParams.set('lng', String(searchLocation.lng));
          nearbyParams.set('lat', String(searchLocation.lat));
          shopRows = await requestShops(nearbyParams);
        }

        if (shopRows.length === 0) {
          // Fallback to Hyderabad area for demo purposes
          const defaultParams = new URLSearchParams({ gender });
          defaultParams.set('lng', '79.5941');
          defaultParams.set('lat', '17.9689');
          shopRows = await requestShops(defaultParams);
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
  }, [filterGender, user.homeLocation?.lat, user.homeLocation?.lng, userLocation?.lat, userLocation?.lng, userLoading, user.homeLocation, userLocation]);

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
          {/* Logo Placeholder */}

          {/* Search & Gender */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 540, margin: '0 auto' }}>
            <div style={{ flex: 1, position: 'relative' }}>
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
            {/* Gender Filter */}
            <select
              value={filterGender}
              onChange={e => setFilterGender(e.target.value)}
              style={{
                padding: '0.55rem 0.9rem',
                background: T.s2, border: `1px solid ${T.br}`,
                borderRadius: 50, color: T.text, fontSize: 13, outline: 'none',
                fontFamily: "'Poppins',sans-serif", cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Unisex">All</option>
            </select>
          </div>

          {/* Profile */}
          <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {getCustomerToken() ? (
              <>
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
                />
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{
                  background: T.gold, color: '#fff', border: 'none',
                  padding: '0.5rem 1.2rem', borderRadius: 50,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Poppins',sans-serif",
                }}
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      <CustomerAuthModal 
        open={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onSuccess={(newUser) => {
          setShowAuthModal(false);
          setUser({ ...user, ...newUser });
          loadMyBookings();
          // Optional: re-trigger shops fetch
        }}
      />

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
                          <span className="one-line-ellipsis" title={b.shopAddress}>{b.shopAddress}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {b.verificationCode && (
                          <>
                            <div style={{ fontSize: 9, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Verification</div>
                            <div className="badge-verification">
                              {b.verificationCode}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', gap: 12 }}>
                      <div style={{ fontSize: 12, color: T.text2, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                          <div className="two-line-clamp" style={{ fontWeight: 600 }} title={b.service}>{b.service}</div>
                          {b.isHomeVisit && (
                            <span className="badge-home">
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
                              <span className="badge-active">
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

        </div>
      </main>


    </div>
  );
};

const ShopBookingPage = ({ shop, onBack, onBookingSuccess }) => {
  const T = useTheme();
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedDate, setSelectedDate] = useState(INITIAL_BOOKING_DATE);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [createdBooking, setCreatedBooking] = useState(null);
  const preferredCustomerLocation = normalizeLocation(shop.defaultCustomerLocation) || null;
  const [homeLocation, setHomeLocation] = useState(null);
  const [isLoadingHomeLocation, setIsLoadingHomeLocation] = useState(false);
  const [shopBarbers, setShopBarbers] = useState([]);
  const [selectedBarber] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const [effectiveSlotDuration, setEffectiveSlotDuration] = useState(30);
  const [timelineOpen, setTimelineOpen] = useState(Number(shop.open || CUSTOMER_TIMELINE_OPEN));
  const [timelineClose, setTimelineClose] = useState(Number(shop.close || CUSTOMER_TIMELINE_CLOSE));
  const [showAuthModal, setShowAuthModal] = useState(false);
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

    if (!getCustomerToken()) {
      setShowAuthModal(true);
      return;
    }

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

    void handleConfirmBooking();
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
                  {isSubmittingBooking ? 'Booking...' : loadingBarbers ? 'Loading...' : 'Confirm Booking'}
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
        <div className="modal-overlay">
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

      <CustomerAuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          // Wait briefly for token to persist then confirm booking
          setTimeout(() => handleConfirmBooking(), 100);
        }}
      />
    </div>
  );
};

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
