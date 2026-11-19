import React, { useId } from 'react';

interface ScratchpadLogoProps {
  className?: string;
}

export const ScratchpadLogo: React.FC<ScratchpadLogoProps> = ({
  className = 'w-8 h-8',
}) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `sp-bg-${uid}`;
  const clawId = `sp-claw-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={bgId}
          x1="6"
          y1="4"
          x2="58"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#18181B" />
          <stop offset="100%" stopColor="#09090B" />
        </linearGradient>
        <linearGradient
          id={clawId}
          x1="18"
          y1="20"
          x2="46"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FF3B3B" />
          <stop offset="55%" stopColor="#DC2626" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
      </defs>

      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="14"
        fill={`url(#${bgId})`}
        stroke="#DC2626"
        strokeWidth="2.5"
      />

      <path
        d="M12 12 C6 22 6 42 12 52 C9 42 9 22 12 12 Z"
        fill="#DC2626"
        opacity="0.85"
      />

      <path
        d="M18 14 H41 L49 22 V49 A3 3 0 0 1 46 52 H18 A3 3 0 0 1 15 49 V17 A3 3 0 0 1 18 14 Z"
        fill="#1F1F26"
        stroke="#71717A"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <path
        d="M41 14 V22 H49 Z"
        fill="#3F3F46"
        stroke="#71717A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      <rect x="21" y="9.5" width="3.5" height="7" rx="1.75" fill="#E4E4E7" />
      <rect x="28.5" y="9.5" width="3.5" height="7" rx="1.75" fill="#E4E4E7" />
      <rect x="36" y="9.5" width="3.5" height="7" rx="1.75" fill="#E4E4E7" />

      <line
        x1="20"
        y1="28"
        x2="43"
        y2="28"
        stroke="#32323C"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="36"
        x2="44"
        y2="36"
        stroke="#32323C"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="44"
        x2="41"
        y2="44"
        stroke="#32323C"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      <path
        d="M18 32.5 Q28 37.5 31.5 48.5 Q21.5 43.5 18 32.5 Z"
        fill={`url(#${clawId})`}
      />
      <path
        d="M22.5 23.5 Q37 31 43 47.5 Q28.5 40 22.5 23.5 Z"
        fill={`url(#${clawId})`}
      />
      <path
        d="M31 21.5 Q42.5 26.5 46.5 39 Q35 33.5 31 21.5 Z"
        fill={`url(#${clawId})`}
      />

      <path
        d="M24.5 26 Q33.5 31.5 38.5 41.5"
        stroke="#FCA5A5"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
};
