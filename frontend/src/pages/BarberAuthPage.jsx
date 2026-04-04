import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserPlus, FaArrowLeft, FaCheck, FaMapMarkerAlt } from 'react-icons/fa';
import {
  FaStore, FaLink,
  FaCircleCheck, FaUser, FaEye, FaEyeSlash
} from 'react-icons/fa6';
import BrandLogo from '../components/BrandLogo';
import InputField from '../components/InputField';
import PasswordInput from '../components/PasswordInput';
import ForgotPasswordForm from '../components/ForgotPasswordForm';
import RoleBadge from '../components/RoleBadge';
import ServiceCheckbox from '../components/ServiceCheckbox';
import MapPicker from '../components/MapPicker';
import Tooltip from '../components/Tooltip';
import { getServicesByGender, SERVICES } from '../data/services';
import {
  apiRequest,
  setBarberProfileCache,
  setBarberToken,
  seedBarberScheduleForUpcomingDays,
} from '../api/client';
import { formatCoordinateAddress, normalizeLocation } from '../utils/location';
import '../App.css';

/* ── Validation ──────────────────────────────────────────── */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[6-9]\d{9}$/;
const upiRe = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;
const DEFAULT_GENERAL_WORK_START = '09:00';
const DEFAULT_GENERAL_WORK_END = '21:00';
const BARBER_TERMS = [
  'Shop and service changes reflect instantly, but already booked next-day services must still be honored.',
  'Do not block leave or pause slots that are already occupied by confirmed customer bookings.',
  'Mark leave, breaks, or unavailable time early in the morning before customers start booking for the day.',
  'Keep working hours, services, and home-service availability accurate at all times.',
  'Repeated no-shows, false availability, cancellations, or misconduct may lead to account restrictions.',
];

const timeStrToMins = (value) => {
  if (!value) return 0;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
};

const normalizeUpiId = (value = '') => String(value).trim().toLowerCase();

const buildGeneralBreaksPayload = (form) => {
  if (!form.generalLunchStart || !form.generalLunchEnd) {
    return [];
  }

  return [
    {
      breakStart: timeStrToMins(form.generalLunchStart),
      breakEnd: timeStrToMins(form.generalLunchEnd),
      label: 'Lunch Break',
    },
  ];
};

const validateWorkingHours = (form) => {
  const errors = {};

  if (!form.generalWorkStart) {
    errors.generalWorkStart = 'Start time is required';
  }

  if (!form.generalWorkEnd) {
    errors.generalWorkEnd = 'End time is required';
  }

  if (errors.generalWorkStart || errors.generalWorkEnd) {
    return errors;
  }

  const workStart = timeStrToMins(form.generalWorkStart);
  const workEnd = timeStrToMins(form.generalWorkEnd);

  if (workEnd <= workStart) {
    errors.generalWorkEnd = 'End time must be after start time';
  }

  const hasLunchStart = Boolean(form.generalLunchStart);
  const hasLunchEnd = Boolean(form.generalLunchEnd);

  if (hasLunchStart !== hasLunchEnd) {
    const message = 'Select both lunch start and lunch end';
    if (!hasLunchStart) errors.generalLunchStart = message;
    if (!hasLunchEnd) errors.generalLunchEnd = message;
    return errors;
  }

  if (!hasLunchStart) {
    return errors;
  }

  const lunchStart = timeStrToMins(form.generalLunchStart);
  const lunchEnd = timeStrToMins(form.generalLunchEnd);

  if (lunchEnd <= lunchStart) {
    errors.generalLunchEnd = 'Lunch end must be after lunch start';
    return errors;
  }

  if (lunchStart < workStart || lunchEnd > workEnd) {
    const message = 'Lunch break must be within working hours';
    errors.generalLunchStart = message;
    errors.generalLunchEnd = message;
  }

  return errors;
};

const persistBarberSession = (payload = {}) => {
  const { token, barber, shop } = payload;

  if (token) {
    setBarberToken(token);
  }

  if (!barber) {
    return;
  }

  setBarberProfileCache({
    ...barber,
    id: barber.id || null,
    barberId: barber.barberId || barber.id || null,
    shopId: barber.shopId || shop?.id || null,
    shopName: barber.shopName || shop?.name || '',
    shopCode: barber.shopCode || shop?.shopCode || '',
    upiId: barber.upiId || '',
  });
};

const warmBarberSession = ({ enableHomeService = false } = {}) => {
  void (async () => {
    try {
      await seedBarberScheduleForUpcomingDays(4);

      if (enableHomeService) {
        await apiRequest('/barbers/home-toggle', {
          method: 'PUT',
          auth: 'barber',
          body: { isAccepting: true },
        });
      }
    } catch (err) {
      console.warn('Barber post-login setup failed:', err);
    }
  })();
};

const validatePersonal = (f) => {
  const e = {};
  if (!f.name.trim()) e.name = 'Full name is required';
  if (!f.email) e.email = 'Email is required';
  else if (!emailRe.test(f.email)) e.email = 'Enter a valid email';
  if (!f.phone) e.phone = 'Phone number is required';
  else if (!phoneRe.test(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
  if (!f.upiId?.trim()) e.upiId = 'UPI ID is required';
  else if (!upiRe.test(normalizeUpiId(f.upiId))) e.upiId = 'Enter a valid UPI ID';
  if (!f.password) e.password = 'Password is required';
  else if (f.password.length < 8) e.password = 'Minimum 8 characters';
  if (!f.confirmPassword) e.confirmPassword = 'Please confirm your password';
  else if (f.password !== f.confirmPassword) e.confirmPassword = 'Passwords do not match';
  return e;
};

const WorkingHoursSection = ({ form, set, errors, prefix }) => (
  <div className="form-stack" style={{ gap: '0.75rem' }}>
    <div className="section-heading">General Working Hours</div>
    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-0.25rem 0 0.25rem' }}>
      These become your default daily working hours and lunch break.
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
      <InputField
        label="Work Start"
        id={`${prefix}-general-work-start`}
        type="time"
        value={form.generalWorkStart}
        onChange={set('generalWorkStart')}
        error={errors.generalWorkStart}
        required
      />
      <InputField
        label="Work End"
        id={`${prefix}-general-work-end`}
        type="time"
        value={form.generalWorkEnd}
        onChange={set('generalWorkEnd')}
        error={errors.generalWorkEnd}
        required
      />
      <InputField
        label="Lunch Break Start"
        id={`${prefix}-general-lunch-start`}
        type="time"
        value={form.generalLunchStart}
        onChange={set('generalLunchStart')}
        error={errors.generalLunchStart}
      />
      <InputField
        label="Lunch Break End"
        id={`${prefix}-general-lunch-end`}
        type="time"
        value={form.generalLunchEnd}
        onChange={set('generalLunchEnd')}
        error={errors.generalLunchEnd}
      />
    </div>
    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '-0.25rem 0 0' }}>
      Leave the lunch fields blank if you do not want a default lunch break.
    </p>
  </div>
);

/* ── Gender Radio ────────────────────────────────────────── */
const GenderRadio = ({ value, onChange }) => (
  <div className="input-group">
    <label>Gender Served <span style={{ color: 'var(--text-error)' }}>*</span></label>
    <div className="gender-group">
      {['Male', 'Female', 'Both'].map((g) => (
        <label
          key={g}
          className={`gender-radio ${value === g.toLowerCase() ? 'active' : ''}`}
          onClick={() => onChange(g.toLowerCase())}
        >
          <input type="radio" readOnly />
          {g}
        </label>
      ))}
    </div>
  </div>
);

/* ── Services Section ────────────────────────────────────── */
const ServicesSection = ({ gender, selectedIds, onToggle, error }) => {
  const services = getServicesByGender(gender);
  return (
    <div className="form-stack">
      <div className="section-heading">Service Configuration</div>
      <GenderRadio value={gender} onChange={(g) => onToggle('__gender__', g)} />
      {gender ? (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-0.25rem 0 0.25rem' }}>
            Showing {services.length} services for {gender} clients. Select all that apply.
          </p>
          <div className="services-grid">
            {services.map((svc) => (
              <ServiceCheckbox
                key={svc.id}
                service={svc}
                checked={selectedIds.includes(svc.id)}
                onChange={() => onToggle(svc.id)}
              />
            ))}
          </div>
          {error && <span className="error-msg">⚠ {error}</span>}
        </>
      ) : (
        <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Select a gender above to see available services.
        </p>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   LOGIN FORM
───────────────────────────────────────────────────────── */
const BarberLoginForm = ({ onSwitch, onLogin }) => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetNotice, setResetNotice] = useState('');
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!emailRe.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    setErrors({});
    setResetNotice('');
    try {
      const res = await apiRequest('/auth/barber/login', {
        method: 'POST',
        auth: 'none',
        body: { email: form.email.trim(), password: form.password },
      });
      persistBarberSession(res.data);
      onLogin();
      warmBarberSession();
    } catch (err) {
      setErrors({ api: err.message || 'Login failed' });
    } finally {
      setBusy(false);
    }
  };

  if (showForgot) {
    return (
      <ForgotPasswordForm
        requestPath="/auth/barber/forgot-password"
        resetPath="/auth/barber/reset-password"
        accountLabel="barber"
        emailPlaceholder="you@barbershop.com"
        onBack={() => setShowForgot(false)}
        onDone={(message) => {
          setShowForgot(false);
          setResetNotice(message);
          setErrors({});
          setForm((current) => ({ ...current, password: '' }));
        }}
      />
    );
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      <InputField
        label="Email Address" id="barber-login-email" type="email"
        placeholder="you@barbershop.com" value={form.email}
        onChange={set('email')} error={errors.email} required
      />
      <PasswordInput
        label="Password" id="barber-login-pw"
        placeholder="Enter your password" value={form.password}
        onChange={set('password')} error={errors.password} required
        autoComplete="current-password"
      />
      {resetNotice && <p className="helper-text" style={{ color: 'var(--teal)', marginTop: '-0.4rem' }}>{resetNotice}</p>}
      <div className="helper-row">
        <button
          type="button"
          className="forgot-link"
          onClick={() => {
            setShowForgot(true);
            setErrors({});
          }}
        >
          Forgot Password?
        </button>
      </div>
      {errors.api && <span className="error-msg">⚠ {errors.api}</span>}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Please wait…' : 'Login'}
      </button>
      <p className="switch-row">
        New here?{' '}
        <button type="button" className="btn-link" onClick={onSwitch}>Sign Up</button>
      </p>
    </form>
  );
};

/* ─────────────────────────────────────────────────────────
   MODE SELECTION
───────────────────────────────────────────────────────── */
const ModeSelection = ({ onSelect }) => (
  <div className="form-stack" style={{ gap: '0.85rem' }}>
    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: 500 }}>
      How would you like to join BookMyCut?
    </p>

    <button type="button" className="mode-btn" onClick={() => onSelect('owner')}>
      <div className="mode-icon teal"><FaStore /></div>
      <div className="mode-text">
        <h4>Add Shop as Owner</h4>
        <p>Register your shop and manage barbers</p>
      </div>
    </button>

    <button type="button" className="mode-btn" onClick={() => onSelect('join')}>
      <div className="mode-icon orange"><FaLink /></div>
      <div className="mode-text">
        <h4>Join a Shop</h4>
        <p>Join an existing shop using a Shop ID</p>
      </div>
    </button>
  </div>
);

/* ─────────────────────────────────────────────────────────
   OWNER SIGNUP FORM
───────────────────────────────────────────────────────── */
const OwnerSignupForm = ({ onBack }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', upiId: '', password: '', confirmPassword: '',
    shopName: '', shopAddress: '', shopCity: '', shopState: '', terms: false,
    generalWorkStart: DEFAULT_GENERAL_WORK_START,
    generalWorkEnd: DEFAULT_GENERAL_WORK_END,
    generalLunchStart: '',
    generalLunchEnd: '',
  });
  const [homeServiceBarber, setHomeServiceBarber] = useState(false);
  const [mapLocation, setMapLocation] = useState(null);
  const [gender, setGender] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleMapSelect = async (loc) => {
    const nextLocation = normalizeLocation(loc, {
      address: formatCoordinateAddress(loc?.lat, loc?.lng),
    });

    if (!nextLocation) {
      return;
    }

    setMapLocation(nextLocation);
    setForm((f) => ({
      ...f,
      shopAddress: nextLocation.address || f.shopAddress,
      shopCity: nextLocation.city || f.shopCity,
      shopState: nextLocation.state || f.shopState,
    }));
  };

  const handleServiceToggle = (id, gOverride) => {
    if (id === '__gender__') {
      setGender(gOverride);
      setSelectedServices([]);
      return;
    }
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const validate = () => {
    const errs = { ...validatePersonal(form), ...validateWorkingHours(form) };
    if (!form.shopName.trim()) errs.shopName = 'Shop name is required';
    if (!mapLocation) errs.map = 'Please select your shop location on the map';
    if (!gender) errs.services = 'Please select gender served';
    else if (selectedServices.length === 0) errs.services = 'Select at least one service';
    if (!form.terms) errs.terms = 'You must agree to Terms & Conditions';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const genderServed = gender === 'female' ? 'Female' : (gender === 'male' ? 'Male' : 'Unisex');
    const isHomeServed = gender === 'female' || gender === 'both';
    const isHome = isHomeServed && homeServiceBarber;

    const servicesPayload = selectedServices
      .map((id) => {
        const s = SERVICES.find((x) => x.id === id);
        if (!s) return null;
        return {
          name: s.name,
          durationMinutes: s.duration,
          price: Math.max(50, Math.round(s.duration * 8)),
          genderSpecific: gender === 'female' ? 'Female' : (gender === 'male' ? 'Male' : 'Unisex'),
        };
      })
      .filter(Boolean);

    setBusy(true);
    setErrors({});
    try {
      const res = await apiRequest('/auth/barber/register/owner', {
        method: 'POST',
        auth: 'none',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          upiId: normalizeUpiId(form.upiId),
          password: form.password,
          shopName: form.shopName.trim(),
          shopAddress: (form.shopAddress || mapLocation.address || '').trim(),
          shopLng: Number(mapLocation.lng),
          shopLat: Number(mapLocation.lat),
          shopCity: form.shopCity,
          shopState: form.shopState,
          genderServed,
          hasHomeService: Boolean(isHome),
          canOfferHomeServices: Boolean(isHome),
          services: servicesPayload,
          openTime: 540,
          closeTime: 1260,
          generalWorkStart: timeStrToMins(form.generalWorkStart),
          generalWorkEnd: timeStrToMins(form.generalWorkEnd),
          generalBreaks: buildGeneralBreaksPayload(form),
        },
      });

      persistBarberSession(res.data);
      navigate('/barber/dashboard');
      warmBarberSession({ enableHomeService: isHome });
    } catch (err) {
      setErrors({ api: err.message || 'Registration failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      <button type="button" className="btn-back" onClick={onBack}>
        <FaArrowLeft size={11} /> Back
      </button>

      {/* ── Personal Details ── */}
      <div className="section-heading">Personal Details</div>
      <InputField label="Full Name" id="owner-name" placeholder="Your full name"
        value={form.name} onChange={set('name')} error={errors.name} required />
      <InputField label="Email Address" id="owner-email" type="email"
        placeholder="you@email.com" value={form.email}
        onChange={set('email')} error={errors.email} required />
      <InputField label="Phone Number" id="owner-phone" type="tel"
        placeholder="10-digit mobile number" value={form.phone}
        onChange={set('phone')} error={errors.phone} required />
      <InputField label="UPI ID" id="owner-upi" type="text"
        placeholder="yourname@bank" value={form.upiId}
        onChange={set('upiId')} error={errors.upiId} required />
      <PasswordInput label="Password" id="owner-pw" placeholder="Min. 8 characters"
        value={form.password} onChange={set('password')} error={errors.password}
        required autoComplete="new-password" />
      <PasswordInput label="Confirm Password" id="owner-cpw" placeholder="Re-enter password"
        value={form.confirmPassword} onChange={set('confirmPassword')}
        error={errors.confirmPassword} required autoComplete="new-password" />

      {/* ── Shop Details ── */}
      <WorkingHoursSection form={form} set={set} errors={errors} prefix="owner" />

      <div className="section-heading" style={{ marginTop: '0.5rem' }}>Shop Details</div>
      <InputField label="Shop Name" id="owner-shopname" placeholder="e.g. The Style House"
        value={form.shopName} onChange={set('shopName')} error={errors.shopName} required />

      <div className="input-group">
        <label htmlFor="owner-address">Shop Address</label>
        <div className="input-wrap">
          <textarea
            id="owner-address"
            placeholder="Enter address or click on the map to auto-fill"
            value={form.shopAddress}
            onChange={set('shopAddress')}
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Leaflet Map */}
      <div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <FaMapMarkerAlt /> Click on the map to pin your shop location
        </p>
        <MapPicker onLocationSelect={handleMapSelect} selected={mapLocation} />
        {mapLocation && (
          <p style={{ fontSize: '0.76rem', color: 'var(--teal)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <FaCircleCheck /> Location selected: {mapLocation.address}
          </p>
        )}
        {errors.map && <span className="error-msg">⚠ {errors.map}</span>}
      </div>

      {/* ── Services ── */}
      <div style={{ marginTop: '0.5rem' }}>
        <ServicesSection
          gender={gender}
          selectedIds={selectedServices}
          onToggle={handleServiceToggle}
          error={errors.services}
        />
      </div>

      {gender === 'female' && (
        <label className="check-label" style={{ marginTop: '0.2rem', marginBottom: '0.6rem', background: 'var(--bg-light)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}>
          <input type="checkbox" checked={homeServiceBarber}
            onChange={() => setHomeServiceBarber(!homeServiceBarber)} />
          I offer home services for female customers
        </label>
      )}

      {/* ── Terms ── */}
      <label className="check-label">
        <input type="checkbox" checked={form.terms}
          onChange={() => setForm((f) => ({ ...f, terms: !f.terms }))} />
        I agree to the barber Terms &amp; Conditions below
      </label>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '12px',
          background: 'var(--bg)',
          padding: '0.9rem 1rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.45rem' }}>
          Barber Terms &amp; Conditions
        </div>
        <ul style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.35rem' }}>
          {BARBER_TERMS.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
      </div>
      {errors.terms && <span className="error-msg">⚠ {errors.terms}</span>}
      {errors.api && <span className="error-msg">⚠ {errors.api}</span>}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Please wait…' : 'Create Barber Account'}
      </button>
    </form>
  );
};

/* ─────────────────────────────────────────────────────────
   JOIN SIGNUP FORM
───────────────────────────────────────────────────────── */
const JoinSignupForm = ({ onBack }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', upiId: '', password: '', confirmPassword: '',
    shopId: '', terms: false,
    generalWorkStart: DEFAULT_GENERAL_WORK_START,
    generalWorkEnd: DEFAULT_GENERAL_WORK_END,
    generalLunchStart: '',
    generalLunchEnd: '',
  });
  const [shopPreview, setShopPreview] = useState(null);
  const [loadingShopPreview, setLoadingShopPreview] = useState(false);
  const [homeServiceBarber, setHomeServiceBarber] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const homeServiceEligible = shopPreview && shopPreview.genderServed !== 'Male';

  useEffect(() => {
    const shopCode = form.shopId.trim();

    if (!shopCode) {
      setShopPreview(null);
      setLoadingShopPreview(false);
      setHomeServiceBarber(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingShopPreview(true);
      try {
        const res = await apiRequest(`/shops/code/${encodeURIComponent(shopCode)}`, {
          method: 'GET',
          auth: 'none',
        });

        if (!cancelled) {
          setShopPreview(res.data || null);
          if ((res.data?.genderServed || '') === 'Male') {
            setHomeServiceBarber(false);
          }
        }
      } catch (_) {
        if (!cancelled) {
          setShopPreview(null);
          setHomeServiceBarber(false);
        }
      } finally {
        if (!cancelled) {
          setLoadingShopPreview(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.shopId]);

  const validate = () => {
    const errs = { ...validatePersonal(form), ...validateWorkingHours(form) };
    if (!form.shopId.trim()) errs.shopId = 'Shop ID is required';
    if (!form.terms) errs.terms = 'You must agree to Terms & Conditions';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    setErrors({});
    try {
      const res = await apiRequest('/auth/barber/register/staff', {
        method: 'POST',
        auth: 'none',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          upiId: normalizeUpiId(form.upiId),
          password: form.password,
          shopCode: form.shopId.trim(),
          generalWorkStart: timeStrToMins(form.generalWorkStart),
          generalWorkEnd: timeStrToMins(form.generalWorkEnd),
          generalBreaks: buildGeneralBreaksPayload(form),
          canOfferHomeServices: Boolean(homeServiceEligible && homeServiceBarber),
        },
      });
      persistBarberSession(res.data);
      navigate('/barber/dashboard');
      warmBarberSession({ enableHomeService: Boolean(homeServiceEligible && homeServiceBarber) });
    } catch (err) {
      setErrors({ api: err.message || 'Could not join shop' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      <button type="button" className="btn-back" onClick={onBack}>
        <FaArrowLeft size={11} /> Back
      </button>

      {/* ── Personal Details ── */}
      <div className="section-heading">Personal Details</div>
      <InputField label="Full Name" id="join-name" placeholder="Your full name"
        value={form.name} onChange={set('name')} error={errors.name} required />
      <InputField label="Email Address" id="join-email" type="email"
        placeholder="you@email.com" value={form.email}
        onChange={set('email')} error={errors.email} required />
      <InputField label="Phone Number" id="join-phone" type="tel"
        placeholder="10-digit mobile number" value={form.phone}
        onChange={set('phone')} error={errors.phone} required />
      <InputField label="UPI ID" id="join-upi" type="text"
        placeholder="yourname@bank" value={form.upiId}
        onChange={set('upiId')} error={errors.upiId} required />
      <PasswordInput label="Password" id="join-pw" placeholder="Min. 8 characters"
        value={form.password} onChange={set('password')} error={errors.password}
        required autoComplete="new-password" />
      <PasswordInput label="Confirm Password" id="join-cpw" placeholder="Re-enter password"
        value={form.confirmPassword} onChange={set('confirmPassword')}
        error={errors.confirmPassword} required autoComplete="new-password" />

      {/* ── Shop Joining ── */}
      <WorkingHoursSection form={form} set={set} errors={errors} prefix="join" />

      <div className="section-heading" style={{ marginTop: '0.5rem' }}>Shop Joining</div>
      <div className="input-group">
        <label htmlFor="join-shopid">
          Shop ID <span style={{ color: 'var(--text-error)' }}>*</span>
          {' '}
          <Tooltip text="Enter the unique ID provided by your shop owner to join their shop." />
        </label>
        <div className="input-wrap">
          <input
            id="join-shopid"
            type="text"
            placeholder="e.g. SHOP-2024-XYZ"
            value={form.shopId}
            onChange={set('shopId')}
            className={errors.shopId ? 'input-error' : ''}
          />
        </div>
        {errors.shopId
          ? <span className="error-msg">⚠ {errors.shopId}</span>
          : <p className="helper-text">Ask your shop owner for the Shop ID</p>
        }
      </div>

      {loadingShopPreview && (
        <p className="helper-text">Checking shop details...</p>
      )}

      {!loadingShopPreview && shopPreview && (
        <div className="helper-text" style={{ marginTop: '-0.35rem' }}>
          Joining <strong>{shopPreview.name}</strong> ({shopPreview.genderServed})
        </div>
      )}

      {homeServiceEligible && (
        <label className="check-label" style={{ marginTop: '0.15rem', background: 'var(--bg-light)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}>
          <input
            type="checkbox"
            checked={homeServiceBarber}
            onChange={() => setHomeServiceBarber((prev) => !prev)}
          />
          I offer home services for female customers
        </label>
      )}



      {/* ── Terms ── */}
      <label className="check-label">
        <input type="checkbox" checked={form.terms}
          onChange={() => setForm((f) => ({ ...f, terms: !f.terms }))} />
        I agree to the barber Terms &amp; Conditions below
      </label>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '12px',
          background: 'var(--bg)',
          padding: '0.9rem 1rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.45rem' }}>
          Barber Terms &amp; Conditions
        </div>
        <ul style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.35rem' }}>
          {BARBER_TERMS.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
      </div>
      {errors.terms && <span className="error-msg">⚠ {errors.terms}</span>}
      {errors.api && <span className="error-msg">⚠ {errors.api}</span>}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Please wait…' : 'Join Shop & Create Account'}
      </button>
    </form>
  );
};

/* ─────────────────────────────────────────────────────────
   BARBER SIGNUP WRAPPER — mode router
───────────────────────────────────────────────────────── */
const BarberSignupSection = () => {
  const [mode, setMode] = useState(null); // null | 'owner' | 'join'

  if (mode === 'owner') return <OwnerSignupForm onBack={() => setMode(null)} />;
  if (mode === 'join') return <JoinSignupForm onBack={() => setMode(null)} />;
  return <ModeSelection onSelect={setMode} />;
};

/* ─────────────────────────────────────────────────────────
   BARBER AUTH PAGE
───────────────────────────────────────────────────────── */
const BarberAuthPage = () => {
  const [tab, setTab] = useState('login');
  const navigate = useNavigate();

  return (
    <div className="page-scroll barber-theme">
      {/* Top back nav */}
      <div style={{ width: '100%', maxWidth: '560px', marginBottom: '1.25rem' }}>
        <button className="btn-back" onClick={() => navigate('/')}>
          <FaArrowLeft size={11} /> Back
        </button>
      </div>

      {/* Card */}
      <div
        className="card"
        style={{ width: '100%', maxWidth: '560px', padding: '2rem', marginBottom: '2rem' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <BrandLogo
            size={36}
            textStyle={{
              fontSize: '1.08rem',
              letterSpacing: '-0.045em',
            }}
          />
          <RoleBadge role="barber" />
        </div>

        {/* Tabs */}
        <div className="auth-tabs" style={{ marginBottom: '1.75rem' }}>
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => setTab('login')}
          >
            Login
          </button>
          <button
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => setTab('signup')}
          >
            Sign Up
          </button>
        </div>

        {tab === 'login'
          ? <BarberLoginForm onSwitch={() => setTab('signup')} onLogin={() => navigate('/barber/dashboard')} />
          : <BarberSignupSection />
        }
      </div>
    </div>
  );
};

export default BarberAuthPage;
