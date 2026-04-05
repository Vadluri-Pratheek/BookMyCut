import React, { useState } from 'react';
import InputField from './InputField';
import PasswordInput from './PasswordInput';
import { apiRequest } from '../api/client';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPasswordForm = ({
  requestPath,
  resetPath,
  accountLabel,
  emailPlaceholder,
  onBack,
  onDone,
}) => {
  const [step, setStep] = useState('request');
  const [form, setForm] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const set = (field) => (e) => {
    const value = field === 'otp'
      ? e.target.value.replace(/\D/g, '').slice(0, 8)
      : e.target.value;

    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    const nextErrors = {};

    if (!form.email) {
      nextErrors.email = 'Email is required';
    } else if (!emailRe.test(form.email)) {
      nextErrors.email = 'Enter a valid email';
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const res = await apiRequest(requestPath, {
        method: 'POST',
        auth: 'none',
        body: {
          email: form.email.trim(),
        },
      });
      setStep('reset');
      setInfo(res.message || 'If the email exists, an OTP has been sent.');
    } catch (err) {
      setErrors({ api: err.message || 'Could not send OTP' });
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const nextErrors = {};

    if (!form.email) {
      nextErrors.email = 'Email is required';
    } else if (!emailRe.test(form.email)) {
      nextErrors.email = 'Enter a valid email';
    }

    if (!form.otp.trim()) {
      nextErrors.otp = 'OTP is required';
    }

    if (!form.newPassword) {
      nextErrors.newPassword = 'New password is required';
    } else if (form.newPassword.length < 8) {
      nextErrors.newPassword = 'Minimum 8 characters';
    }

    if (!form.confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your new password';
    } else if (form.newPassword !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const res = await apiRequest(resetPath, {
        method: 'POST',
        auth: 'none',
        body: {
          email: form.email.trim(),
          otp: form.otp.trim(),
          newPassword: form.newPassword,
        },
      });
      onDone(res.message || `Your ${accountLabel} password has been reset.`);
    } catch (err) {
      setErrors({ api: err.message || 'Could not reset password' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={step === 'request' ? handleRequestOtp : handleResetPassword} noValidate>
      <div className="section-heading" style={{ marginBottom: '0.25rem' }}>Reset Password</div>
      <p className="helper-text" style={{ marginTop: '-0.5rem' }}>
        {step === 'request'
          ? `We'll send a one-time OTP to your ${accountLabel} email address.`
          : 'Enter the OTP from your email and choose a new password.'}
      </p>

      <InputField
        label="Email Address"
        id={`${accountLabel}-forgot-email`}
        type="email"
        placeholder={emailPlaceholder}
        value={form.email}
        onChange={set('email')}
        error={errors.email}
        required
        autoComplete="email"
      />

      {step === 'reset' && (
        <InputField
          label="OTP Code"
          id={`${accountLabel}-forgot-otp`}
          type="text"
          placeholder="Enter the OTP from your email"
          value={form.otp}
          onChange={set('otp')}
          error={errors.otp}
          required
          autoComplete="one-time-code"
        />
      )}

      {step === 'reset' && (
        <PasswordInput
          label="New Password"
          id={`${accountLabel}-forgot-new-password`}
          placeholder="Enter your new password"
          value={form.newPassword}
          onChange={set('newPassword')}
          error={errors.newPassword}
          required
          autoComplete="new-password"
        />
      )}

      {step === 'reset' && (
        <PasswordInput
          label="Confirm New Password"
          id={`${accountLabel}-forgot-confirm-password`}
          placeholder="Re-enter your new password"
          value={form.confirmPassword}
          onChange={set('confirmPassword')}
          error={errors.confirmPassword}
          required
          autoComplete="new-password"
        />
      )}

      {info && <p className="helper-text" style={{ color: 'var(--teal)' }}>{info}</p>}
      {errors.api && <span className="error-msg">{errors.api}</span>}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy
          ? 'Please wait...'
          : step === 'request'
            ? 'Send OTP'
            : 'Reset Password'}
      </button>

      {step === 'reset' && (
        <div className="helper-row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn-link" onClick={handleRequestOtp} disabled={busy}>
            Resend OTP
          </button>
          <button type="button" className="btn-link" onClick={onBack}>
            Back to Login
          </button>
        </div>
      )}

      {step === 'request' && (
        <p className="switch-row">
          Remembered it?{' '}
          <button type="button" className="btn-link" onClick={onBack}>
            Back to Login
          </button>
        </p>
      )}
    </form>
  );
};

export default ForgotPasswordForm;
