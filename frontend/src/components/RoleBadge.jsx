import React from 'react';
import { FaUser, FaScissors } from 'react-icons/fa6';

/**
 * Small pill badge showing the current role
 */
const RoleBadge = ({ role }) => {
  const isBarber = role === 'barber';
  return (
    <span className="role-badge">
      {isBarber ? <FaScissors size={11} /> : <FaUser size={11} />}
      Role: {isBarber ? 'Barber' : 'Customer'}
    </span>
  );
};

export default RoleBadge;
