/** The Quartile mark: a pie with one quarter pulled out. The slice carries the signal color. */
export function QuartileMark({ size = 22, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M14.5 14.5L25.5 14.5A11 11 0 1 0 14.5 25.5Z"
        fill={dark ? '#F2F0E9' : 'var(--q-text)'}
      />
      <path d="M17 17L28 17A11 11 0 0 1 17 28Z" fill={dark ? '#7383FF' : 'var(--q-signal)'} />
    </svg>
  );
}

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="g-wordmark" style={{ fontSize: size }}>
      <QuartileMark size={Math.round(size * 1.22)} />
      quartile
    </span>
  );
}
