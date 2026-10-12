// Custom hand icons replacing the 🙏 and 🙌 emoji — traced from a reference
// "praying hands" icon: two rounded, 3-lobed hand shapes tapering to a
// point at the wrist, stroke-outline style. PraiseHandsIcon reuses the same
// hand silhouette language, just raised and spread apart instead of
// pressed together.

export function PrayingHandsIcon({ className = 'w-6 h-6' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Left hand */}
  <path d="
    M12 3
    C11.35 3 10.9 3.45 10.7 4.15
    L8.45 10.95
    C8.25 11.55 7.9 12.05 7.4 12.45
    L5.25 14.05
    L7.45 16.15
    L9.95 13.85
    L12 11.75
    Z
  "/>

  {/* Right hand */}
  <path d="
    M12 3
    C12.65 3 13.1 3.45 13.3 4.15
    L15.55 10.95
    C15.75 11.55 16.1 12.05 16.6 12.45
    L18.75 14.05
    L16.55 16.15
    L14.05 13.85
    L12 11.75
    Z
  "/>
</svg>
  )
}

export function PraiseHandsIcon({ className = 'w-6 h-6' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Left ray of radiance */}
  <path d="
    M7.1 5.6
    L5.6 4.1
  " />

  {/* Center ray of radiance */}
  <path d="
    M12 5.8
    L12 1.0
  " />

  {/* Right ray of radiance */}
  <path d="
    M16.9 5.6
    L18.4 4.1
  " />

  {/* Cross */}
  <path d="
    M10.9 17.1
    L10.9 10.1
    L7.9 10.1
    L7.9 8.4
    L10.9 8.4
    L10.9 5.5
    L13.1 5.5
    L13.1 8.4
    L16.1 8.4
    L16.1 10.1
    L13.1 10.1
    L13.1 17.1
    Z
  " />

  {/* Hill */}
  <path d="
    M3.2 19.5
    C6.0 17.7 8.9 16.8 12 16.8
    C15.1 16.8 18.0 17.7 20.8 19.5
  " />
</svg>
  )
}

export function PartyHatIcon({ className = 'w-7 h-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 L5 21 H19 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.3" />
      <path d="M9.1 11 H14.9" stroke="#ec4899" strokeWidth="1.8" />
      <path d="M7.1 16 H16.9" stroke="#ec4899" strokeWidth="1.8" />
      <circle cx="12" cy="3.6" r="1.8" fill="#f472b6" stroke="#be185d" strokeWidth="1" />
    </svg>
  )
}