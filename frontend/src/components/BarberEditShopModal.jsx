import React, { useState, useEffect } from 'react';
import { FaTimes, FaMapMarkerAlt, FaCheck } from 'react-icons/fa';
import { apiRequest } from '../api/client';
import { C, inputSt, minsToLabel, getCatalogServicesForShopGender, findCatalogServiceForShopService, getServiceGenderSpecificForShop } from '../pages/BarberDashboard';
import { Label } from './BarberLabel';
import MapPicker from './MapPicker';
import ServiceCheckbox from './ServiceCheckbox';
import { formatCoordinateAddress, normalizeLocation } from '../utils/location';

export const EditShopModal = ({ open, onClose, user, onSave }) => {
  const [form, setForm] = useState({
    name: user.shopName,
    address: user.shopAddress,
    city: user.shopCity || '',
    state: user.shopState || '',
    lat: user.shopLat ?? null,
    lng: user.shopLng ?? null,
    openTime: user.openTime || 540,
    closeTime: user.closeTime || 1260,
    genderServed: 'Unisex',
  });
  const [busy, setBusy] = useState(false);
  const [loadingShop, setLoadingShop] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [loadedServices, setLoadedServices] = useState([]);
  const [shopBarbers, setShopBarbers] = useState([]);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [removingBarberId, setRemovingBarberId] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({
        name: user.shopName,
        address: user.shopAddress,
        city: user.shopCity || '',
        state: user.shopState || '',
        lat: user.shopLat ?? null,
        lng: user.shopLng ?? null,
        openTime: user.openTime || 540,
        closeTime: user.closeTime || 1260,
        genderServed: 'Unisex',
      });
      setLoadedServices([]);
      setSelectedServiceIds([]);
      setShopBarbers([]);
      setRemovingBarberId(null);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    const loadShopDetails = async () => {
      setLoadingShop(true);
      setLoadingBarbers(true);
      try {
        const [shopRes, barbersRes] = await Promise.all([
          apiRequest('/shops/my', {
            method: 'GET',
            auth: 'barber',
          }),
          apiRequest('/barbers/staff', {
            method: 'GET',
            auth: 'barber',
          }),
        ]);

        if (cancelled || !shopRes?.data) return;

        const shop = shopRes.data;
        const genderServed = shop.genderServed || 'Unisex';
        const services = Array.isArray(shop.services) ? shop.services : [];
        const mappedServiceIds = services
          .map((service) => findCatalogServiceForShopService(service, genderServed)?.id)
          .filter(Boolean);

        setForm({
          name: shop.name || user.shopName,
          address: shop.location?.address || user.shopAddress,
          city: shop.location?.city || user.shopCity || '',
          state: shop.location?.state || user.shopState || '',
          lat: shop.location?.coordinates?.[1] ?? user.shopLat ?? null,
          lng: shop.location?.coordinates?.[0] ?? user.shopLng ?? null,
          openTime: shop.openTime || 540,
          closeTime: shop.closeTime || 1260,
          genderServed,
        });
        setLoadedServices(services);
        setSelectedServiceIds(mappedServiceIds);
        setShopBarbers(Array.isArray(barbersRes?.data) ? barbersRes.data : []);
      } catch (err) {
        if (!cancelled) {
          alert(err.message || 'Failed to load shop details');
        }
      } finally {
        if (!cancelled) {
          setLoadingShop(false);
          setLoadingBarbers(false);
        }
      }
    };

    loadShopDetails();
    return () => { cancelled = true; };
  }, [open, user]);

  if (!open) return null;

  const handleMapSelect = async (loc) => {
    const nextLocation = normalizeLocation(loc, {
      address: formatCoordinateAddress(loc?.lat, loc?.lng),
    });

    if (!nextLocation) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      lat: nextLocation.lat,
      lng: nextLocation.lng,
      address: nextLocation.address || prev.address,
      city: nextLocation.city || prev.city,
      state: nextLocation.state || prev.state,
    }));
  };

  const handleRemoveBarber = async (barberId) => {
    const barber = shopBarbers.find((item) => item._id === barberId);
    if (!barber) return;

    const confirmed = window.confirm(`Remove ${barber.name} from this shop?`);
    if (!confirmed) return;

    setRemovingBarberId(barberId);
    try {
      await apiRequest(`/barbers/staff/${barberId}`, {
        method: 'DELETE',
        auth: 'barber',
      });
      setShopBarbers((prev) => prev.filter((item) => item._id !== barberId));
    } catch (err) {
      alert(err.message || 'Failed to remove barber');
    } finally {
      setRemovingBarberId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const catalogServices = getCatalogServicesForShopGender(form.genderServed);
      const existingServicesById = new Map(
        loadedServices
          .map((service) => {
            const matchedService = findCatalogServiceForShopService(service, form.genderServed);
            return matchedService ? [matchedService.id, service] : null;
          })
          .filter(Boolean)
      );
      const servicesPayload = selectedServiceIds
        .map((serviceId) => {
          const existingService = existingServicesById.get(serviceId);
          if (existingService) {
            return existingService;
          }

          const catalogService = catalogServices.find((service) => service.id === serviceId);
          if (!catalogService) return null;

          return {
            name: catalogService.name,
            durationMinutes: catalogService.duration,
            price: Math.max(50, Math.round(catalogService.duration * 8)),
            genderSpecific: getServiceGenderSpecificForShop(catalogService, form.genderServed),
          };
        })
        .filter(Boolean);

      const res = await apiRequest('/shops/my', {
        method: 'PUT',
        auth: 'barber',
        body: {
          ...form,
          services: servicesPayload,
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
      <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: '1rem' }}>Edit Shop Details</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Shop Details</div>
          <div>
            <Label>Shop Name</Label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputSt} required />
          </div>
          <div>
            <Label>Shop Address</Label>
            <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ ...inputSt, height: 60, resize: 'none' }} required />
          </div>
          <div>
            <Label>Shop Location</Label>
            <div style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <MapPicker
                selected={form.lat != null && form.lng != null ? {
                  lat: Number(form.lat),
                  lng: Number(form.lng),
                  address: form.address || 'Selected location',
                } : null}
                onLocationSelect={handleMapSelect}
              />
            </div>
            {form.lat != null && form.lng != null && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.text3 }}>
                Coordinates: {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>Open Time</Label>
              <select value={form.openTime} onChange={e => setForm({ ...form, openTime: Number(e.target.value) })} style={inputSt}>
                {Array.from({ length: 13 }).map((_, i) => {
                  const m = (8 + i) * 60;
                  return <option key={m} value={m}>{minsToLabel(m)}</option>;
                })}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <Label>Close Time</Label>
              <select value={form.closeTime} onChange={e => setForm({ ...form, closeTime: Number(e.target.value) })} style={inputSt}>
                {Array.from({ length: 13 }).map((_, i) => {
                  const m = (17 + i) * 60;
                  return <option key={m} value={m}>{minsToLabel(m)}</option>;
                })}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginTop: '0.25rem' }}>Services</div>
          <div>
            <Label>Services</Label>
            {loadingShop ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Loading services...</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>
                  Based on {form.genderServed === 'Unisex' ? 'Unisex' : form.genderServed} shop services.
                </div>
                <div className="services-grid">
                  {getCatalogServicesForShopGender(form.genderServed).map((service) => (
                    <ServiceCheckbox
                      key={service.id}
                      service={service}
                      checked={selectedServiceIds.includes(service.id)}
                      onChange={() => setSelectedServiceIds((prev) =>
                        prev.includes(service.id)
                          ? prev.filter((id) => id !== service.id)
                          : [...prev, service.id]
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginTop: '0.25rem' }}>Barbers</div>
          <div>
            <Label>Joined Barbers</Label>
            {loadingBarbers ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Loading barbers...</div>
            ) : shopBarbers.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text3, padding: '0.75rem', borderRadius: 10, background: '#f8fafc', border: `1px solid ${C.border}` }}>
                No joined barbers yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shopBarbers.map((barber) => (
                  <div
                    key={barber._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '0.75rem',
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{barber.name}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{barber.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBarber(barber._id)}
                      disabled={removingBarberId === barber._id}
                      style={{
                        flexShrink: 0,
                        padding: '0.45rem 0.7rem',
                        borderRadius: 8,
                        border: '1px solid #fca5a5',
                        background: '#fee2e2',
                        color: '#dc2626',
                        cursor: removingBarberId === barber._id ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'Poppins',sans-serif",
                      }}
                    >
                      {removingBarberId === barber._id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
            <button type="submit" disabled={busy || loadingShop || selectedServiceIds.length === 0} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${C.teal},${C.tealD})`, color: '#fff', cursor: busy || loadingShop || selectedServiceIds.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   BARBER DASHBOARD
════════════════════════════════════════════════════════════════ */
