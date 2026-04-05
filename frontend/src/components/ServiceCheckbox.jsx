import React from 'react';

/**
 * A single service checkbox card shown in the services grid.
 * Shows service name + duration, toggled by clicking anywhere on the card.
 */
const ServiceCheckbox = ({ service, checked, onChange }) => (
  <label
    className={`service-card ${checked ? 'selected' : ''}`}
    htmlFor={`svc-${service.id}`}
  >
    <input
      type="checkbox"
      id={`svc-${service.id}`}
      checked={checked}
      onChange={onChange}
    />
    <div className="svc-info">
      <div className="svc-name">{service.name}</div>
      <div className="svc-dur">{service.duration} mins</div>
    </div>
  </label>
);

export default ServiceCheckbox;
