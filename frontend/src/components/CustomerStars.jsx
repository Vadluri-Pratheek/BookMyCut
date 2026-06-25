import React from 'react';
import { T } from '../pages/CustomerDashboard';

export const Stars = ({ rating }) => (
  <span style={{ color: T.gold, fontSize: 12 }}>
    {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
    <span style={{ color: T.text2, marginLeft: 4, fontSize: 11 }}>{rating}</span>
  </span>
);

