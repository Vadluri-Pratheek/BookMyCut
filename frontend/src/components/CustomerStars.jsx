import React from 'react';
import { FaStar, FaStarHalfAlt, FaRegStar } from 'react-icons/fa';
import { useTheme } from '../hooks/useTheme';

export const Stars = ({ rating }) => {
  const T = useTheme();
  return (
    <span style={{ color: T.gold, fontSize: 12 }}>
      {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
      <span style={{ color: T.text2, marginLeft: 4, fontSize: 11 }}>{rating}</span>
    </span>
  );
};
