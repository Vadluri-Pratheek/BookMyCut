const hasValidCoordinate = (value) => Number.isFinite(Number(value));

export const formatCoordinateAddress = (lat, lng, label = 'Selected location') =>
  `${label} (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;

export const normalizeLocation = (location, fallback = {}) => {
  const source = location || fallback;
  if (!source) return null;

  let lat = null;
  let lng = null;

  if (Array.isArray(source.coordinates) && source.coordinates.length >= 2) {
    lng = Number(source.coordinates[0]);
    lat = Number(source.coordinates[1]);
  } else if (hasValidCoordinate(source.lat) && hasValidCoordinate(source.lng)) {
    lat = Number(source.lat);
    lng = Number(source.lng);
  }

  if (!hasValidCoordinate(lat) || !hasValidCoordinate(lng)) {
    return null;
  }

  const address = String(
    source.address
    || fallback.address
    || formatCoordinateAddress(lat, lng)
  ).trim();
  const city = String(source.city || fallback.city || '').trim();
  const state = String(source.state || fallback.state || '').trim();
  const normalized = {
    lat,
    lng,
    address,
  };

  if (city) normalized.city = city;
  if (state) normalized.state = state;

  if (hasValidCoordinate(source.accuracy ?? fallback.accuracy)) {
    normalized.accuracy = Number(source.accuracy ?? fallback.accuracy);
  }

  const locationSource = String(source.source || fallback.source || '').trim();
  if (locationSource) {
    normalized.source = locationSource;
  }

  return normalized;
};

export const reverseGeocodeLocation = async (lat, lng) => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    addressdetails: '1',
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: {
      'Accept-Language': 'en',
    },
  });

  if (!res.ok) {
    throw new Error(`Reverse geocoding failed (${res.status})`);
  }

  const data = await res.json();
  const address = data?.display_name ? String(data.display_name).trim() : '';
  const city = String(
    data?.address?.city
    || data?.address?.town
    || data?.address?.village
    || data?.address?.suburb
    || ''
  ).trim();
  const state = String(data?.address?.state || '').trim();

  return {
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  };
};

export const resolveLocationDetails = async (location, fallback = {}) => {
  const normalized = normalizeLocation(location, fallback);
  if (!normalized) return null;

  try {
    const geocoded = await reverseGeocodeLocation(normalized.lat, normalized.lng);
    return normalizeLocation({
      ...normalized,
      ...geocoded,
      address: geocoded.address || normalized.address,
    });
  } catch {
    return normalized;
  }
};

export const getCurrentBrowserLocation = ({ resolveAddress = true } = {}) =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const baseLocation = normalizeLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps',
          address: formatCoordinateAddress(
            position.coords.latitude,
            position.coords.longitude,
            'Current location'
          ),
        });

        if (!baseLocation) {
          reject(new Error('Unable to read your current location.'));
          return;
        }

        if (!resolveAddress) {
          resolve(baseLocation);
          return;
        }

        try {
          resolve(await resolveLocationDetails(baseLocation));
        } catch {
          resolve(baseLocation);
        }
      },
      () => {
        reject(new Error('Unable to get your current location. Please enable location services.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
