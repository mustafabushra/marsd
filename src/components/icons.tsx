export function LogoMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-brand-500 text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-[60%] h-[60%]">
        <path
          d="M5 12.5l4.5 4.5L19 7"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function SearchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={2} />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChartIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={4} y={13} width={3.2} height={7} rx={0.8} fill="currentColor" />
      <rect x={10.4} y={8} width={3.2} height={12} rx={0.8} fill="currentColor" />
      <rect x={16.8} y={4} width={3.2} height={16} rx={0.8} fill="currentColor" />
    </svg>
  );
}

export function HeartHandIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 7.5c-1.2-2-3.9-2.6-5.6-1-1.8 1.7-1.8 4.3 0 6.1L12 18l5.6-5.4c1.8-1.8 1.8-4.4 0-6.1-1.7-1.6-4.4-1-5.6 1z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowLeft({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M19 12H5m0 0l6-6m-6 6l6 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
