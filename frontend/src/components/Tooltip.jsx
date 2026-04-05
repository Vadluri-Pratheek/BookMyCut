import React from 'react';
import { FaCircleInfo } from 'react-icons/fa6';

/**
 * Info icon with a hover tooltip
 */
const Tooltip = ({ text }) => (
  <span className="tooltip-wrap">
    <FaCircleInfo className="tooltip-icon" />
    <span className="tip">{text}</span>
  </span>
);

export default Tooltip;
