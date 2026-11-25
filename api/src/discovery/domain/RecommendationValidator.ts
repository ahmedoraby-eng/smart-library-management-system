import { MAX_ITEMS, MAX_REASON_LENGTH, type Candidate } from "./Discovery";

export interface ValidRecommendation { candidate: Candidate; reason: string }
export interface ValidatedOutput { items: ValidRecommendation[]; note: string | null; dropped: number }

// Control characters are stripped on purpose: model output must not reach the UI with them.
// eslint-disable-next-line no-control-regex
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();

/**
 * The real guard against a wrong or manipulated model (architecture §6): only candidate ids survive,
 * duplicates collapse, at most `limit` items, reasons are plain text of at most 300 characters.
 * Availability is never taken from the output; the caller re-reads it from the database.
 * Returns null when the output has no usable shape at all (the caller falls back).
 */
export function validateRecommendations(raw: unknown, candidates: Candidate[], limit: number = MAX_ITEMS): ValidatedOutput | null {
  let data: unknown = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const rec = (data as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(rec)) return null;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const items: ValidRecommendation[] = [];
  let dropped = 0;
  const ordered = rec
    .map((r, i) => ({ r: r as { bookId?: unknown; reason?: unknown; fit?: unknown }, i }))
    .sort((a, b) => fitOf(b.r) - fitOf(a.r) || a.i - b.i); // stable: model order within the same fit
  for (const { r } of ordered) {
    const id = typeof r?.bookId === "string" ? r.bookId : null;
    const candidate = id ? byId.get(id) : undefined;
    if (!candidate || seen.has(candidate.id) || items.length >= limit) {
      dropped++;
      continue;
    }
    seen.add(candidate.id);
    const reason = typeof r.reason === "string" ? clean(r.reason, MAX_REASON_LENGTH) : "";
    items.push({ candidate, reason: reason || templateReason(candidate) });
  }
  const noteRaw = (data as { note?: unknown }).note;
  const note = typeof noteRaw === "string" && clean(noteRaw, MAX_REASON_LENGTH) ? clean(noteRaw, MAX_REASON_LENGTH) : null;
  return { items, note, dropped };
}

const fitOf = (r: { fit?: unknown } | null) => (typeof r?.fit === "number" && Number.isFinite(r.fit) ? r.fit : 0);

/** «Matches: x, y» from retrieval's own terms; used by the fallback and for AI items that came without a reason. */
export function templateReason(c: Candidate): string {
  if (c.matchedTerms.length) return `Matches: ${c.matchedTerms.join(", ")}`;
  // SLM-16: found by vector search only, so no request word appears in its text.
  if (c.foundBy === "semantic") return `Close in meaning to the request (${c.category})`;
  return `Related to “${c.category}”`;
}
