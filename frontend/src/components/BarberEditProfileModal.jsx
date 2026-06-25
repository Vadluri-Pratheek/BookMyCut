import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { C, upiRe, normalizeUpiId, inputSt } from '../pages/BarberDashboard';
import { Label } from './BarberLabel';

export const EditProfileModal = ({ open, onClose, user, onSave }) => {
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '', upiId: user.upiId || '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;

    setForm({
      name: user.name || '',
      phone: user.phone || '',
      upiId: user.upiId || '',
    });
  }, [open, user.name, user.phone, user.upiId]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.upiId && !upiRe.test(normalizeUpiId(form.upiId))) {
      alert('Enter a valid UPI ID');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest('/barbers/profile', {
        method: 'PUT',
        auth: 'barber',
        body: {
          ...form,
          upiId: normalizeUpiId(form.upiId),
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
      <div className="modal-content" style={{ width: "100%", maxWidth: 400, padding: "1.5rem" }}>
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
          <div>
            <Label>UPI ID</Label>
            <input value={form.upiId} onChange={e => setForm({ ...form, upiId: e.target.value })} style={inputSt} placeholder="yourname@bank" />
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

