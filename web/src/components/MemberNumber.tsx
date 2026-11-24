/** Catalogue-card mono; in the plain theme --font-mono is Inter, so it reads as before. */
const MONO = "font-mono text-[12.5px] tracking-[.01em] plain:text-[length:inherit] plain:tracking-normal";

/** Member numbers ("M-000008"): IBM Plex Mono (Inter in plain), tabular digits, a normal hyphen (not a wide tabular one). */
export function MemberNumber({ value }: { value: string }) {
  const m = /^([A-Za-z]*)[-\u2010-\u2015](\d+)$/.exec(value);
  if (!m) return <span className={MONO}>{value}</span>;
  return (
    <span className={MONO}>
      {m[1]}-<span className="tabular-nums">{m[2]}</span>
    </span>
  );
}
