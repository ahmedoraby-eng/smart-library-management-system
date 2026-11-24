/** Member numbers ("M-000008"): Inter, tabular digits only, a normal hyphen (not a wide tabular one). */
export function MemberNumber({ value }: { value: string }) {
  const m = /^([A-Za-z]*)[-\u2010-\u2015](\d+)$/.exec(value);
  if (!m) return <span className="tabular-nums">{value}</span>;
  return (
    <span>
      {m[1]}-<span className="tabular-nums">{m[2]}</span>
    </span>
  );
}
