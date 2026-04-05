const AVERAGE_MINUTES_PER_KM = 3;
const EARTH_RADIUS_KM = 6371;

const hasValidCoordinate = (value) => Number.isFinite(Number(value));

const normalizePoint = (location) => {
  if (!location) return null;

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    const [lng, lat] = location.coordinates;
    if (hasValidCoordinate(lat) && hasValidCoordinate(lng)) {
      return { lat: Number(lat), lng: Number(lng) };
    }
  }

  if (hasValidCoordinate(location.lat) && hasValidCoordinate(location.lng)) {
    return { lat: Number(location.lat), lng: Number(location.lng) };
  }

  return null;
};

const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;

const getDistanceKm = ({ from, to }) => {
  const start = normalizePoint(from);
  const end = normalizePoint(to);

  if (!start || !end) {
    return 0;
  }

  const latDelta = toRadians(end.lat - start.lat);
  const lngDelta = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);

  const a = Math.sin(latDelta / 2) ** 2
    + (Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
};

const getTravelBufferMinutes = ({ customerLocation, shopLocation, avgMinutesPerKm = AVERAGE_MINUTES_PER_KM }) => {
  const distanceKm = getDistanceKm({ from: customerLocation, to: shopLocation });
  if (!distanceKm) return 0;

  return Math.max(0, Math.ceil(distanceKm * Number(avgMinutesPerKm)));
};

const getEffectiveSlotDurationMinutes = ({ serviceDuration, customerLocation, shopLocation }) =>
  Number(serviceDuration) + getTravelBufferMinutes({ customerLocation, shopLocation });

const getEffectiveSlotEndMinutes = ({ slotStartMinutes, serviceDuration, customerLocation, shopLocation }) =>
  Number(slotStartMinutes) + getEffectiveSlotDurationMinutes({
    serviceDuration,
    customerLocation,
    shopLocation,
  });

module.exports = {
  AVERAGE_MINUTES_PER_KM,
  normalizePoint,
  getDistanceKm,
  getTravelBufferMinutes,
  getEffectiveSlotDurationMinutes,
  getEffectiveSlotEndMinutes,
};
