import React, { useState } from 'react';
import { FaXmark, FaEnvelope, FaLock, FaUser, FaPhone, FaSpinner } from 'react-icons/fa6';
import { apiRequest, setCustomerToken, setCustomerProfileCache } from '../api/client';
import BrandLogo from './BrandLogo';

export const CustomerAuthModal = ({ open, onClose, onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otp, setOtp] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (showOtpForm) {
        const res = await apiRequest('/auth/verify-email', {
          method: 'POST',
          auth: 'none',
          body: { email: formData.email, otp },
        });

        if (res.success && res.data?.token) {
          setCustomerToken(res.data.token);
          setCustomerProfileCache(res.data.user);
          onSuccess(res.data.user);
        } else {
          setError(res.message || 'OTP verification failed');
        }
      } else {
        const endpoint = isLogin ? '/auth/login' : '/auth/register';
        const body = isLogin 
          ? { email: formData.email, password: formData.password }
          : { ...formData, role: 'customer' };

        const res = await apiRequest(endpoint, {
          method: 'POST',
          auth: 'none',
          body,
        });

        if (res.success && res.requireVerification) {
          setShowOtpForm(true);
        } else if (res.success && res.data?.token) {
          setCustomerToken(res.data.token);
          setCustomerProfileCache(res.data.user);
          onSuccess(res.data.user);
        } else {
          setError(res.message || 'Authentication failed');
        }
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem 0.75rem 2.5rem',
    borderRadius: '0.5rem',
    border: '1px solid #e2e8f0',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: "'Poppins', sans-serif",
  };

  const iconStyle = {
    position: 'absolute',
    left: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'Poppins', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: '1.25rem', width: '100%', maxWidth: 400,
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)', position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: '#0f172a', padding: '1.5rem', textAlign: 'center', position: 'relative' }}>
          <button onClick={onClose} style={{
            position: 'absolute', right: '1rem', top: '1rem',
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            width: 30, height: 30, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <FaXmark size={16} />
          </button>
          
          <BrandLogo size={32} />
          <h2 style={{ color: '#fff', margin: '1rem 0 0', fontSize: '1.25rem', fontWeight: 500 }}>
            {showOtpForm ? 'Verify Email' : (isLogin ? 'Welcome Back' : 'Create Account')}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
            {showOtpForm ? `Enter the 6-digit code sent to ${formData.email}` : `Please ${isLogin ? 'login' : 'sign up'} to confirm your booking`}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {showOtpForm ? (
              <div style={{ position: 'relative' }}>
                <FaLock style={iconStyle} />
                <input
                  type="text"
                  required
                  placeholder="6-digit OTP"
                  style={inputStyle}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                />
              </div>
            ) : (
              <>
                {!isLogin && (
                  <>
                    <div style={{ position: 'relative' }}>
                      <FaUser style={iconStyle} />
                      <input
                        type="text"
                        required
                        placeholder="Full Name"
                        style={inputStyle}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <FaPhone style={iconStyle} />
                      <input
                        type="tel"
                        required
                        placeholder="Phone Number"
                        style={inputStyle}
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                  </>
                )}

                <div style={{ position: 'relative' }}>
                  <FaEnvelope style={iconStyle} />
                  <input
                    type="email"
                    required
                    placeholder="Email Address"
                    style={inputStyle}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div style={{ position: 'relative' }}>
                  <FaLock style={iconStyle} />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    style={inputStyle}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#0d9488', color: '#fff', padding: '0.875rem',
                borderRadius: '0.5rem', border: 'none', fontWeight: 600,
                fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center',
              }}
            >
              {loading ? <FaSpinner className="spin" /> : (showOtpForm ? 'Verify OTP' : (isLogin ? 'Login' : 'Sign Up'))}
            </button>
          </form>

          {!showOtpForm && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b' }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#0d9488', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                {isLogin ? 'Sign Up' : 'Login'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
