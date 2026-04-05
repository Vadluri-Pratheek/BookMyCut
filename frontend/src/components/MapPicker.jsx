import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  formatCoordinateAddress,
  getCurrentBrowserLocation,
  normalizeLocation,
  resolveLocationDetails,
} from '../utils/location';

// Fix Leaflet default icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * Inner component that listens to map click events
 */
function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      void onSelect({ lat, lng, source: 'map' });
    },
  });
  return null;
}

function RecenterOnSelection({ selected }) {
  const map = useMap();

  useEffect(() => {
    if (selected?.lat != null && selected?.lng != null) {
      map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 14), {
        animate: true,
      });
    }
  }, [map, selected]);

  return null;
}

/**
 * MapPicker — interactive Leaflet map for selecting shop location.
 * Props:
 *   onLocationSelect({ lat, lng, address }) — called when user clicks map
 */
const MapPicker = ({ onLocationSelect, selected }) => {
  const defaultCenter = [20.5937, 78.9629]; // India centroid
  const defaultZoom = 5;
  const [locating, setLocating] = useState(false);
  const [resolvingSelection, setResolvingSelection] = useState(false);
  const [locationError, setLocationError] = useState('');

  const handleResolvedSelection = async (location) => {
    const baseLocation = normalizeLocation(location, {
      address: formatCoordinateAddress(location?.lat, location?.lng),
      source: location?.source || 'map',
    });

    if (!baseLocation) {
      setLocationError('Please select a valid location on the map.');
      return;
    }

    setResolvingSelection(true);
    setLocationError('');

    try {
      const resolved = await resolveLocationDetails(baseLocation);
      onLocationSelect(resolved || baseLocation);
    } catch {
      onLocationSelect(baseLocation);
    } finally {
      setResolvingSelection(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setLocationError('');

    try {
      const location = await getCurrentBrowserLocation();
      onLocationSelect(location);
    } catch {
      setLocationError('Could not access your current location. Please click the map instead.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="map-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          style={{
            border: '1px solid var(--teal-light)',
            borderRadius: 8,
            background: 'var(--teal-xlight)',
            color: 'var(--teal-dark)',
            padding: '0.45rem 0.75rem',
            cursor: locating ? 'wait' : 'pointer',
            fontSize: '0.85rem',
          }}
        >
          {locating ? 'Locating...' : 'Use Current Location'}
        </button>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
            </span>
            {selected.accuracy != null && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Accuracy: {Math.round(selected.accuracy)} m
              </span>
            )}
          </div>
        )}
      </div>
      {resolvingSelection && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Resolving location details...
        </div>
      )}
      {locationError && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-error)', marginBottom: '0.5rem' }}>
          {locationError}
        </div>
      )}
      <MapContainer
        center={selected ? [selected.lat, selected.lng] : defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ClickHandler onSelect={handleResolvedSelection} />
        <RecenterOnSelection selected={selected} />
        {selected && (
          <Marker position={[selected.lat, selected.lng]} />
        )}
      </MapContainer>
    </div>
  );
};

export default MapPicker;
