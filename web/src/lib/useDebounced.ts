import { useEffect, useState } from "react";

/** `value`, settled for `ms` (search-as-you-type without a request per keystroke). */
export function useDebounced(value: string, ms = 200): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
