import React, { useId } from 'react';

const defaultTextStyle = {
  fontWeight: 800,
  letterSpacing: '-0.045em',
  lineHeight: 0.94,
  display: 'inline-flex',
  alignItems: 'baseline',
  whiteSpace: 'nowrap',
  textShadow: '-10px 0 18px rgba(13, 148, 136, 0.12), 12px 0 18px rgba(249, 115, 22, 0.14)',
};

const bookSegmentStyle = {
  color: '#f47c18',
};

const mySegmentStyle = {
  display: 'inline-block',
  background: 'linear-gradient(90deg, #0d9488 0%, #f47c18 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  marginInline: '0.02em 0.01em',
};

const cutSegmentStyle = {
  color: '#ff8a1f',
};

const BrandMark = ({ size, title }) => {
  const rawId = useId().replace(/:/g, '');
  const clipperGradientId = `${rawId}-clipper`;
  const scissorGradientId = `${rawId}-scissor`;
  const combGradientId = `${rawId}-comb`;
  const tealGradientId = `${rawId}-teal`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={clipperGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffcf4d" />
          <stop offset="55%" stopColor="#ff9b14" />
          <stop offset="100%" stopColor="#f57600" />
        </linearGradient>
        <linearGradient id={scissorGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffb22e" />
          <stop offset="55%" stopColor="#ff7b00" />
          <stop offset="100%" stopColor="#ef5e00" />
        </linearGradient>
        <linearGradient id={combGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd166" />
          <stop offset="100%" stopColor="#ff9f1c" />
        </linearGradient>
        <linearGradient id={tealGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1f9a94" />
          <stop offset="100%" stopColor="#0f5a67" />
        </linearGradient>
      </defs>

      <path
        d="M58 12H35v72h27c12 0 20-7 20-18 0-9-6-15-14-17 9-2 14-8 14-18 0-12-8-19-24-19Z"
        fill="none"
        stroke={`url(#${tealGradientId})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.96"
      />

      <g transform="translate(4 0)">
        <rect
          x="12"
          y="18"
          width="20"
          height="54"
          rx="9"
          fill={`url(#${clipperGradientId})`}
          stroke="#0f6470"
          strokeWidth="2.4"
        />
        <path
          d="M11 37c-4 6-4 13 0 18"
          fill="none"
          stroke="#0f6470"
          strokeWidth="4.8"
          strokeLinecap="round"
        />
        <circle cx="13.5" cy="28" r="2.2" fill="#fff8e7" />
        <path d="M14 72h16" stroke="#0f6470" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 76h8" stroke="#0f6470" strokeWidth="3" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((tooth) => (
          <rect
            key={tooth}
            x={13 + tooth * 4}
            y="11"
            width="2.6"
            height="9"
            rx="1.1"
            fill="#f57600"
          />
        ))}
      </g>

      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M49 49L73 20" stroke="#0f6470" strokeWidth="9" />
        <path d="M52 50L76 29" stroke={`url(#${scissorGradientId})`} strokeWidth="6.5" />
        <path d="M49 49L71 74" stroke={`url(#${scissorGradientId})`} strokeWidth="7.5" />
        <path d="M50 46L63 61" stroke="#0f6470" strokeWidth="3.5" />
        <circle cx="45" cy="67" r="8.6" fill="#fffaf1" stroke="#ef7a00" strokeWidth="4.6" />
        <circle cx="76" cy="69" r="8.8" fill="#fffaf1" stroke="#ef7a00" strokeWidth="4.6" />
        <circle cx="50.2" cy="50.2" r="3" fill="#fff4df" stroke="#ef7a00" strokeWidth="1.8" />
      </g>

      <g transform="translate(0 2)">
        <path
          d="M35 82L54 59l13 8-20 18Z"
          fill={`url(#${combGradientId})`}
          stroke="#ef7a00"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {[0, 1, 2, 3, 4, 5, 6].map((tooth) => (
          <path
            key={tooth}
            d={`M${41 + tooth * 3.1} ${78 - tooth * 2.5}l-3.2 4.1`}
            stroke="#fff7e7"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
};

const BrandWordmark = ({ text, style, className }) => {
  const mergedStyle = {
    ...defaultTextStyle,
    ...style,
  };

  if (text !== 'BookMyCut') {
    return (
      <span className={className} style={mergedStyle}>
        {text}
      </span>
    );
  }

  return (
    <span className={className} style={mergedStyle}>
      <span style={bookSegmentStyle}>Book</span>
      <span style={mySegmentStyle}>My</span>
      <span style={cutSegmentStyle}>Cut</span>
    </span>
  );
};

const BrandLogo = ({
  size = 38,
  text = 'BookMyCut',
  showText = true,
  gap = 10,
  textStyle = {},
  wordmarkStyle = {},
  containerStyle = {},
  markStyle = {},
  markClassName = '',
  wordmarkClassName = '',
  title = 'BookMyCut',
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap,
      ...containerStyle,
    }}
  >
    <span className={markClassName} style={{ display: 'inline-flex', flexShrink: 0, ...markStyle }}>
      <BrandMark size={size} title={title} />
    </span>
    {showText && (
      <BrandWordmark
        text={text}
        className={wordmarkClassName}
        style={{
          fontSize: Math.max(16, Math.round(size * 0.49)),
          ...textStyle,
          ...wordmarkStyle,
        }}
      />
    )}
  </div>
);

export default BrandLogo;
