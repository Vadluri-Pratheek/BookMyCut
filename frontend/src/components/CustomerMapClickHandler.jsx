import React from 'react';
import { useMapEvents } from 'react-leaflet';
import { resolveLocationDetails } from '../utils/location';

export function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      void resolveLocationDetails({ lat, lng, source: 'map' }, {
        address: `Selected location (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      }).then((location) => {
        if (location) {
          onSelect(location);
        }
      });
    },
  });
  return null;
}

