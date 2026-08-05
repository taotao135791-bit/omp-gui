import { useId } from 'react'

interface LogoProps {
  size?: number
  className?: string
}

/**
 * OMP GUI brand mark: a terracotta squircle with a geometric π drawn as
 * strokes — no font rendering, so it scales cleanly from 16px sidebar use
 * to the 1024px app icon. Colors follow the theme accent variables.
 */
export default function Logo({ size = 20, className }: LogoProps) {
  const id = useId()
  const gradientId = `omp-logo-${id.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="OMP GUI"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent-bright))" />
          <stop offset="1" stopColor="rgb(var(--accent-deep))" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill={`url(#${gradientId})`} />
      <path
        d="M7 8.2h10M9.9 8.2v5.4c0 1.6-.8 2.4-2.1 2.7M14.1 8.2V17"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
