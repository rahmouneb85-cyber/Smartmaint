import React from 'react';

function SmartMaintLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect width="100" height="100" rx="12" fill="#111111"/>
      <rect x="20" y="20" width="60" height="60" rx="4" fill="none" stroke="#FF6B00" strokeWidth="3"/>
      <circle cx="50" cy="50" r="14" fill="#FF6B00"/>
      <circle cx="50" cy="50" r="6" fill="#111111"/>
      <line x1="50" y1="20" x2="50" y2="8" stroke="#FF6B00" strokeWidth="2"/>
      <circle cx="50" cy="6" r="3" fill="#FF6B00"/>
      <line x1="50" y1="80" x2="50" y2="92" stroke="#FF6B00" strokeWidth="2"/>
      <circle cx="50" cy="94" r="3" fill="#FF6B00"/>
      <line x1="20" y1="50" x2="8" y2="50" stroke="#FF6B00" strokeWidth="2"/>
      <circle cx="6" cy="50" r="3" fill="#FF6B00"/>
      <line x1="80" y1="50" x2="92" y2="50" stroke="#FF6B00" strokeWidth="2"/>
      <circle cx="94" cy="50" r="3" fill="#FF6B00"/>
      <rect x="22" y="22" width="8" height="8" rx="1" fill="#FF6B00" opacity="0.6"/>
      <rect x="70" y="22" width="8" height="8" rx="1" fill="#FF6B00" opacity="0.6"/>
      <rect x="22" y="70" width="8" height="8" rx="1" fill="#FF6B00" opacity="0.6"/>
      <rect x="70" y="70" width="8" height="8" rx="1" fill="#FF6B00" opacity="0.6"/>
    </svg>
  );
}

export default SmartMaintLogo;