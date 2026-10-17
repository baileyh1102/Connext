import { useId } from 'react'

// Custom channel icon: a slanted, round-ended hash mark. When `locked` is true
// a small padlock sits in the bottom-right corner (with a gap cut out around it).
export default function ChannelIcon({ locked = false, size = 16, className = '' }) {
  const maskId = 'ci' + useId().replace(/:/g, '')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      {locked && (
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="24" height="24" fill="white" />
            <rect x="11" y="10.5" width="14" height="13" rx="4" fill="black" />
          </mask>
        </defs>
      )}
      <g mask={locked ? `url(#${maskId})` : undefined}>
        <path d="M9.5 3.5 7.5 20.5" />
        <path d="M16.5 3.5 14.5 20.5" />
        <path d="M4 9h16" />
        <path d="M3.5 15.5h16" />
      </g>
      {locked && (
        <g>
          <rect x="13.5" y="14" width="9" height="7.5" rx="2" fill="currentColor" stroke="none" />
          <path d="M15.5 14v-1.5a2.5 2.5 0 0 1 5 0V14" strokeWidth="1.8" />
        </g>
      )}
    </svg>
  )
}