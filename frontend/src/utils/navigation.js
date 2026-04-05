import { getCurrentBrowserLocation, normalizeLocation } from './location';

const getDestinationQuery = (location) => {
  const normalized = normalizeLocation(location);
  if (normalized) {
    return `${normalized.lat},${normalized.lng}`;
  }

  return String(location?.address || '').trim();
};

const buildDirectionsUrl = (origin, destination) => {
  const params = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'driving',
  });

  if (origin) {
    params.set('origin', origin);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

export const openDirectionsFromCurrentLocation = async (destination) => {
  const destinationQuery = getDestinationQuery(destination);
  if (!destinationQuery) {
    return false;
  }

  try {
    const currentLocation = await getCurrentBrowserLocation({ resolveAddress: false });
    window.location.assign(buildDirectionsUrl(
      `${currentLocation.lat},${currentLocation.lng}`,
      destinationQuery
    ));
  } catch {
    window.location.assign(buildDirectionsUrl('My Location', destinationQuery));
  }

  return true;
};

export { getCurrentBrowserLocation };
