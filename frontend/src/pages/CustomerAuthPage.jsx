import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaScissors } from 'react-icons/fa6';
import InputField from '../components/InputField';
import PasswordInput from '../components/PasswordInput';
import ForgotPasswordForm from '../components/ForgotPasswordForm';
import RoleBadge from '../components/RoleBadge';
import { apiRequest, setCustomerProfileCache, setCustomerToken } from '../api/client';
import '../App.css';

/* ── Validation helpers ──────────────────────────────────── */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[6-9]\d{9}$/;

const persistCustomerSession = (payload = {}) => {
  const { token, customer } = payload;

  if (token) {
    setCustomerToken(token);
  }

  if (!customer) {
    return;
  }

  setCustomerProfileCache({
    ...customer,
    id: customer.id || customer._id || null,
  });
};

/* ── Login Form ──────────────────────────────────────────── */
const LoginForm = ({ onSwitch, onLogin }) => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetNotice, setResetNotice] = useState('');

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!emailRe.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    setErrors({});
    setResetNotice('');
    try {
      const res = await apiRequest('/auth/customer/login', {
        method: 'POST',
        auth: 'none',
        body: { email: form.email.trim(), password: form.password },
      });
      persistCustomerSession(res.data);
      onLogin();
    } catch (err) {
      setErrors({ api: err.message || 'Login failed' });
    } finally {
      setBusy(false);
    }
  };

  if (showForgot) {
    return (
      <ForgotPasswordForm
        requestPath="/auth/customer/forgot-password"
        resetPath="/auth/customer/reset-password"
        accountLabel="customer"
        emailPlaceholder="you@email.com"
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
        label="Email Address" id="cust-login-email" type="email"
        placeholder="you@email.com" value={form.email}
        onChange={set('email')} error={errors.email} required
      />
      <PasswordInput
        label="Password" id="cust-login-pw"
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
        Don't have an account?{' '}
        <button type="button" className="btn-link" onClick={onSwitch}>Sign Up</button>
      </p>
    </form>
  );
};

/* ── Signup Form ─────────────────────────────────────────── */
const SignupForm = ({ onSwitch, onLogin }) => {
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    password: '', confirmPassword: '', gender: '',
    city: '', state: '',
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setGender = (g) => setForm((f) => ({ ...f, gender: g }));
  const setTerms = () => setForm((f) => ({ ...f, terms: !f.terms }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Full name is required';
    if (!form.email) errs.email = 'Email is required';
    else if (!emailRe.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.phone) errs.phone = 'Phone number is required';
    else if (!phoneRe.test(form.phone)) errs.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'Minimum 8 characters';
    if (!form.confirmPassword) errs.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (!form.gender) errs.gender = 'Please select a gender';
    if (!form.city.trim()) errs.city = 'City is required';
    if (!form.state.trim()) errs.state = 'State is required';
    if (!form.terms) errs.terms = 'You must agree to Terms & Conditions';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    setErrors({});
    const genderApi = form.gender === 'female' ? 'Female' : 'Male';
    try {
      const res = await apiRequest('/auth/customer/register', {
        method: 'POST',
        auth: 'none',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
          gender: genderApi,
          city: form.city.trim(),
          state: form.state.trim(),
        },
      });
      persistCustomerSession(res.data);
      onLogin();
    } catch (err) {
      setErrors({ api: err.message || 'Registration failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      <InputField
        label="Full Name" id="cust-name" placeholder="John Smith"
        value={form.name} onChange={set('name')} error={errors.name} required
      />
      <InputField
        label="Email Address" id="cust-email" type="email"
        placeholder="you@email.com" value={form.email}
        onChange={set('email')} error={errors.email} required
      />
      <InputField
        label="Phone Number" id="cust-phone" type="tel"
        placeholder="10-digit mobile number" value={form.phone}
        onChange={set('phone')} error={errors.phone} required
      />
      <PasswordInput
        label="Password" id="cust-pw" placeholder="Min. 8 characters"
        value={form.password} onChange={set('password')}
        error={errors.password} required autoComplete="new-password"
      />
      <PasswordInput
        label="Confirm Password" id="cust-cpw" placeholder="Re-enter password"
        value={form.confirmPassword} onChange={set('confirmPassword')}
        error={errors.confirmPassword} required autoComplete="new-password"
      />

      <div style={{ display: 'flex', gap: '1rem' }}>
        <InputField
          label="City" id="cust-city" placeholder="e.g. Mumbai"
          value={form.city} onChange={set('city')} error={errors.city} required
        />
        <InputField
          label="State" id="cust-state" placeholder="e.g. Maharashtra"
          value={form.state} onChange={set('state')} error={errors.state} required
        />
      </div>

      {/* Gender */}
      <div className="input-group">
        <label>Gender <span style={{ color: 'var(--text-error)' }}>*</span></label>
        <div className="gender-group">
          {['Male', 'Female'].map((g) => (
            <label
              key={g}
              className={`gender-radio ${form.gender === g.toLowerCase() ? 'active' : ''}`}
              onClick={() => setGender(g.toLowerCase())}
            >
              <input type="radio" name="cust-gender" value={g.toLowerCase()} readOnly />
              {g}
            </label>
          ))}
        </div>
        {errors.gender && <span className="error-msg">⚠ {errors.gender}</span>}
      </div>

      {/* Terms */}
      <label className="check-label">
        <input type="checkbox" checked={form.terms} onChange={setTerms} />
        I agree to the <a href="#">Terms &amp; Conditions</a>
      </label>
      {errors.terms && <span className="error-msg">⚠ {errors.terms}</span>}
      {errors.api && <span className="error-msg">⚠ {errors.api}</span>}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Please wait…' : 'Create Account'}
      </button>
      <p className="switch-row">
        Already have an account?{' '}
        <button type="button" className="btn-link" onClick={onSwitch}>Login</button>
      </p>
    </form>
  );
};

/* ── Page ─────────────────────────────────────────────────── */
const CustomerAuthPage = () => {
  const [tab, setTab] = useState('login');
  const navigate = useNavigate();

  return (
    <div className="page-scroll">
      {/* Top nav */}
      <div style={{ width: '100%', maxWidth: '480px', marginBottom: '1.25rem' }}>
        <button className="btn-back" onClick={() => navigate('/')}>
          <FaArrowLeft size={11} /> Back
        </button>
      </div>

      {/* Card */}
      <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '2rem' }}>
        {/* Logo row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              background: 'linear-gradient(135deg,#0d9488,#0f766e)',
              borderRadius: '10px', width: '34px', height: '34px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '1rem',
            }}>
              <FaScissors />
            </span>
            <span style={{
              fontSize: '1.2rem', fontWeight: 800,
              background: 'linear-gradient(135deg,#0d9488,#0f766e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}>
              BookMyCut
            </span>
          </div>
          <RoleBadge role="customer" />
        </div>

        {/* Tabs */}
        <div className="auth-tabs" style={{ marginBottom: '1.75rem' }}>
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>
            Login
          </button>
          <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>
            Sign Up
          </button>
        </div>

        {tab === 'login'
          ? <LoginForm onSwitch={() => setTab('signup')} onLogin={() => navigate('/dashboard')} />
          : <SignupForm onSwitch={() => setTab('login')} onLogin={() => navigate('/dashboard')} />
        }
      </div>
    </div>
  );
};

export default CustomerAuthPage;
