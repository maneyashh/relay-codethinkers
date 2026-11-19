/**
 * Relay identity.
 *
 * A serif monogram held in a soft silver squircle, paired with a tightly
 * tracked wordmark. Deliberately restrained: one tile, one letter, no effects
 * beyond a machined gradient and a hairline edge.
 */

const KEYS = {
  sm: 28,
  md: 36,
  lg: 44,
} as const;

const WORDS = {
  sm: 'text-[15px]',
  md: 'text-[19px]',
  lg: 'text-[25px]',
} as const;

const TRACK = {
  sm: '-0.035em',
  md: '-0.04em',
  lg: '-0.045em',
} as const;

const GAPS = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3',
} as const;

export function RelayMark({
  size = KEYS.md,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background:
          'linear-gradient(150deg, #ffffff 0%, #f4f4f6 44%, #c8c8d1 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(9,9,11,0.06), 0 8px 22px -12px rgba(0,0,0,0.9)',
      }}
    >
      <span
        style={{
          fontFamily: "Georgia, 'Times New Roman', Times, serif",
          fontSize: Math.round(size * 0.63),
          lineHeight: 1,
          fontWeight: 600,
          color: '#0a0a0c',
          transform: 'translateY(-0.03em)',
        }}
      >
        R
      </span>
    </span>
  );
}

export function RelayLogo({
  size = 'md',
  subtitle,
  className = '',
}: {
  size?: keyof typeof KEYS;
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center ${GAPS[size]} ${className}`}>
      <RelayMark size={KEYS[size]} />
      <span className="flex min-w-0 flex-col">
        <span
          className={`${WORDS[size]} font-medium leading-none text-zinc-50`}
          style={{
            fontFamily: 'var(--font-geist-sans)',
            letterSpacing: TRACK[size],
          }}
        >
          Relay
        </span>
        {subtitle ? (
          <span className="mt-1.5 truncate font-mono text-[7.5px] uppercase tracking-[0.22em] text-zinc-500">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
