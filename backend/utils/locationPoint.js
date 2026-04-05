const hasValidCoordinate = (value) => Number.isFinite(Number(value));

const normalizeLocationPoint = (location) => {
  if (!location) return null;

  let lat = null;
  let lng = null;

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    lng = Number(location.coordinates[0]);
    lat = Number(location.coordinates[1]);
  } else if (hasValidCoordinate(location.lat) && hasValidCoordinate(location.lng)) {
    lat = Number(location.lat);
    lng = Number(location.lng);
  }

  if (!hasValidCoordinate(lat) || !hasValidCoordinate(lng)) {
    return null;
  }

  const normalized = {
    lat,
    lng,
  };

  const address = String(location.address || '').trim();
  const city = String(location.city || '').trim();
  const state = String(location.state || '').trim();
  const source = String(location.source || '').trim();

  if (address) normalized.address = address;
  if (city) normalized.city = city;
  if (state) normalized.state = state;
  if (source) normalized.source = source;

  if (hasValidCoordinate(location.accuracy)) {
    normalized.accuracy = Number(location.accuracy);
  }

  return normalized;
};

module.exports = {
  normalizeLocationPoint,
};
