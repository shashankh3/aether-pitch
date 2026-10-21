"use client";
// AETHER PITCH — synthetic club crests (100% fictional clubs, no real IP).

export function NLACrest({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.08} viewBox="0 0 40 44" aria-label="North Larchmont Athletic crest">
      <defs>
        <linearGradient id="nla-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF4D6E" />
          <stop offset="55%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#7F0F26" />
        </linearGradient>
      </defs>
      <path
        d="M20 1 L38 7 V24 C38 34 30 40 20 43 C10 40 2 34 2 24 V7 Z"
        fill="url(#nla-g)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.6"
      />
      <path d="M20 1 L38 7 L20 43 L2 7 Z" fill="rgba(255,255,255,0.14)" />
      <path d="M23 9 L15 24 h5 L17 35 L27 19 h-5 Z" fill="#fff" />
      <circle cx="31" cy="10" r="2" fill="#FFC24D" />
    </svg>
  );
}

export function MCSCrest({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.08} viewBox="0 0 40 44" aria-label="Meridian City SC crest">
      <defs>
        <linearGradient id="mcs-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="55%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="22" r="19" fill="url(#mcs-g)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
      <path d="M1 24 q9 -6 19 0 t19 0 V22 q-9 6 -19 0 t-19 0 Z" fill="rgba(255,255,255,0.9)" />
      <path d="M4 33 q8 -5 16 0 t16 0 v-3 q-8 5 -16 0 t-16 0 Z" fill="rgba(255,255,255,0.55)" />
      <path d="M20 3 v10 M14 5 l3 7 M26 5 l-3 7" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" />
      <circle cx="20" cy="12" r="2.2" fill="#FFC24D" />
    </svg>
  );
}

export const CRESTS: Record<"NLA" | "MCS", (p: { size?: number }) => JSX.Element> = {
  NLA: NLACrest,
  MCS: MCSCrest,
};
