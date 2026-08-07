interface LogoProps {
  size?: number
  className?: string
}

/**
 * OMP GUI brand mark: a π assembled from modular bars — top beam plus two
 * legs with visible assembly seams, echoing the "assemble your pi" idea.
 * Pure geometry (no font, no enclosing square), so it scales from the 14px
 * sidebar row to the 1024px app icon without going mushy.
 */
export default function Logo({ size = 20, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="OMP GUI"
    >
      {/* top beam */}
      <rect x="5.4" y="6.2" width="13.2" height="2.5" rx="1.25" fill="rgb(var(--accent-deep))" />
      {/* legs — the seam below the beam is the assembly joint */}
      <rect x="8.1" y="9.9" width="2.5" height="6.4" rx="1.25" fill="rgb(var(--accent))" />
      <rect x="13.4" y="9.9" width="2.5" height="7.6" rx="1.25" fill="rgb(var(--accent))" />
    </svg>
  )
}
