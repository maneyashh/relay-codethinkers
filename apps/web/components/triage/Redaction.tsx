'use client';

const BARS = [
  { top: '9%', w: '88%' },
  { top: '27%', w: '72%' },
  { top: '45%', w: '94%' },
  { top: '63%', w: '66%' },
  { top: '81%', w: '80%' },
];

/** Absolute visual overlay used to strike through a rejected claim. */
export function Redaction({ tone = 'rejected' }: { tone?: 'rejected' | 'merged' }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      aria-hidden
    >
      {BARS.map((b, i) => (
        <span
          key={i}
          className="absolute left-4 h-[26px] origin-left animate-in fade-in slide-in-from-left-2 rounded-[2px]"
          style={{
            top: b.top,
            width: b.w,
            background: tone === 'merged' ? '#3f3f46' : '#09090b',
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}
