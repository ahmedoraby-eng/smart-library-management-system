/**
 * SLM-16 chunking: a book's catalogue text → self-contained chunks for embedding.
 * Header line (title, author, category) on every chunk, so a chunk still says which book it is.
 * The description is split into sentences and packed into windows of at most MAX_WORDS words,
 * each window repeating the last sentence of the previous one (overlap). Today's descriptions are
 * short, so most books give one chunk; long text (blurbs, contents) scales without a redesign.
 */
export const MAX_WORDS = 120;
export const OVERLAP_SENTENCES = 1;

export interface BookText {
  title: string;
  author: string;
  category: string;
  description: string | null;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Sentences of the text; a sentence longer than the window is cut into window-sized pieces. */
export function sentences(text: string, maxWords = MAX_WORDS): string[] {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const parts = raw.split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“'(])/u);
  return parts.flatMap((p) => {
    const w = words(p);
    if (w.length <= maxWords) return [p];
    const out: string[] = [];
    for (let i = 0; i < w.length; i += maxWords) out.push(w.slice(i, i + maxWords).join(" "));
    return out;
  });
}

export function header(b: BookText): string {
  return `${b.title.trim()} — ${b.author.trim()} (${b.category.trim()})`;
}

/** Chunks for one book, in order. Always at least one (the header alone when there is no description). */
export function chunkBook(b: BookText, maxWords = MAX_WORDS, overlap = OVERLAP_SENTENCES): string[] {
  const head = header(b);
  const sents = sentences(b.description ?? "", maxWords);
  if (sents.length === 0) return [head];

  const chunks: string[] = [];
  let start = 0;
  while (start < sents.length) {
    let end = start;
    let count = 0;
    while (end < sents.length && (end === start || count + words(sents[end]!).length <= maxWords)) {
      count += words(sents[end]!).length;
      end++;
    }
    chunks.push(`${head}\n${sents.slice(start, end).join(" ")}`);
    if (end >= sents.length) break;
    // Step forward, keeping `overlap` sentences, but always make progress.
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** The text a book's chunks were made from, plus the model: when it changes, the chunks are stale. */
export function sourceKey(b: BookText, model: string): string {
  return [model, b.title, b.author, b.category, b.description ?? ""].join("␟");
}
