// Pacher brand mark: a "P" monogram in a rounded indigo badge with an approval
// check — the letter is the name, the check nods to "approval & tracking".
// Inline SVG so it inherits crisp rendering at any size and needs no extra
// request (works under the strict CSP). `size` sets both width and height.
export default function Logo({ size = 28, className }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Pacher"
    >
      <defs>
        <linearGradient id="pacherGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#pacherGrad)" />
      <g transform="translate(17,15) scale(0.607)" fill="#ffffff" fillRule="evenodd">
        <path
          d="M0,0 L28,0 C33,0 40,6 40,15 C40,24 33,30 28,30 L11,30 L11,56 L0,56 Z
             M11,9 L25,9 C29,9 31,11 31,15 C31,19 29,21 25,21 L11,21 Z"
        />
      </g>
      <circle cx="47" cy="47" r="12" fill="#ffffff" />
      <path
        d="M41.5,47.5 L45.5,51.5 L53,43.5"
        fill="none"
        stroke="#4338ca"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
