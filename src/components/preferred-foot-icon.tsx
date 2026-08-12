function FootShape({ side }: { side: "LEFT" | "RIGHT" }) {
  const mirror = "translate(20 0) scale(-1 1)";
  const soleTransform = side === "RIGHT" ? mirror : undefined;
  const toesTransform = side === "LEFT" ? mirror : undefined;
  return (
    <svg viewBox="0 0 20 32" aria-hidden="true" focusable="false">
      <g transform={toesTransform}>
        <circle cx="4.1" cy="4.7" r="3.1" />
        <circle cx="9.4" cy="3.6" r="2.55" />
        <circle cx="13.6" cy="4.3" r="2.05" />
        <circle cx="16.6" cy="6" r="1.65" />
        <circle cx="18.1" cy="8.7" r="1.3" />
      </g>
      <g transform={soleTransform}>
        <path d="M5.1 9.1C2.2 11.2 2.1 16.8 3.8 20.7c1.6 3.7 1.1 8.7 4.6 10.2 2.4 1 5.2-.5 5.4-3.4.2-3.1-1.9-5.2-.5-8.2 1.4-3.1 1.4-6.5-.7-8.7-1.8-1.9-5.2-2.7-7.5-1.5Z" />
      </g>
    </svg>
  );
}

export function PreferredFootIcon({ value }: { value: string | null | undefined }) {
  const normalized = value?.toUpperCase();
  if (normalized === "LEFT") return <span className="preferred-foot-icon left"><FootShape side="LEFT" /></span>;
  if (normalized === "RIGHT") return <span className="preferred-foot-icon right"><FootShape side="RIGHT" /></span>;
  if (normalized === "BOTH") return <span className="preferred-foot-icon both"><FootShape side="LEFT" /><FootShape side="RIGHT" /></span>;
  return null;
}
