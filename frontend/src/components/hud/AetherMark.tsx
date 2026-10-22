"use client";

import { useId } from "react";

interface Props {
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function AetherMark({ size = 34, className, animate = true }: Props) {
  const uid = useId().replace(/:/g, "");
  const gradient = `aether-mark-${uid}`;
  const glow = `aether-glow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="6" y1="3" x2="42" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00F0FF" />
          <stop offset="0.52" stopColor="#B8F4FF" />
          <stop offset="1" stopColor="#FF1E56" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.42" r="0.62">
          <stop stopColor="#00F0FF" stopOpacity="0.24" />
          <stop offset="1" stopColor="#00F0FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d="M24 3.1 42.6 13.5v21L24 44.9 5.4 34.5v-21L24 3.1Z" fill={`url(#${glow})`} />
      <path
        d="M24 3.1 42.6 13.5v21L24 44.9 5.4 34.5v-21L24 3.1Z"
        stroke={`url(#${gradient})`}
        strokeWidth="1.15"
      />
      <path
        d="M24 7.7 39 16.3v15.4L24 40.3 9 31.7V16.3L24 7.7Z"
        stroke="#FFFFFF"
        strokeOpacity="0.13"
      />

      <circle
        cx="24"
        cy="24"
        r="14.5"
        stroke={`url(#${gradient})`}
        strokeOpacity="0.7"
        strokeWidth="0.9"
        strokeDasharray="2 7"
        className={animate ? "animate-spin-slow" : undefined}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      <path d="M15.4 33.2 24 11.4l8.6 21.8" stroke="#F2FBFF" strokeWidth="1.65" strokeLinejoin="miter" />
      <path d="M19.2 26.1h9.6" stroke={`url(#${gradient})`} strokeWidth="1.65" />
      <circle cx="24" cy="24.9" r="1.45" fill="#00F0FF" />

      <path d="M24 3.1v3.4M42.6 13.5l-3 1.7M42.6 34.5l-3-1.7M24 44.9v-3.4M5.4 34.5l3-1.7M5.4 13.5l3 1.7" stroke="#00F0FF" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  );
}
