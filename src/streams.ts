import { watchMatches } from "./watchlist";
import type { Candidate, Source } from "./types";

export type SignalStream = "news" | "community";
export type SavedStream = SignalStream | "all";

export function candidateStream(item: Pick<Candidate, "source_type" | "content_type">): SignalStream {
  return item.source_type === "community" || ["community", "meme", "trend"].includes(item.content_type) ? "community" : "news";
}

export function sourceStream(source: Source): SignalStream {
  return source.kind === "community" ? "community" : "news";
}

/** Stream + category filter, watchlist hits first, then score; capped at 20. */
export function streamCandidates(items: Candidate[], stream: SignalStream, category = "전체", watchlist: string[] = []): Candidate[] {
  return items.filter((item) => candidateStream(item) === stream && (category === "전체" || item.category === category))
    .map((item) => ({ item, watched: watchMatches(item, watchlist).length > 0 }))
    .sort((a, b) => Number(b.watched) - Number(a.watched) || b.item.score - a.item.score)
    .map(({ item }) => item)
    .slice(0, 20);
}

export function replaceStream(items: Candidate[], incoming: Candidate[], stream: SignalStream): Candidate[] {
  return [...items.filter((item) => candidateStream(item) !== stream), ...incoming.filter((item) => candidateStream(item) === stream)];
}
