import type { Candidate, Source } from "./types";

export type SignalStream = "news" | "community";
export type SavedStream = SignalStream | "all";

export function candidateStream(item: Pick<Candidate, "source_type" | "content_type">): SignalStream {
  return item.source_type === "community" || ["community", "meme", "trend"].includes(item.content_type) ? "community" : "news";
}

export function sourceStream(source: Source): SignalStream {
  return source.kind === "community" ? "community" : "news";
}

export function streamCandidates(items: Candidate[], stream: SignalStream, category = "전체"): Candidate[] {
  return items.filter((item) => candidateStream(item) === stream && (category === "전체" || item.category === category))
    .sort((a, b) => b.score - a.score).slice(0, 20);
}

export function replaceStream(items: Candidate[], incoming: Candidate[], stream: SignalStream): Candidate[] {
  return [...items.filter((item) => candidateStream(item) !== stream), ...incoming.filter((item) => candidateStream(item) === stream)];
}
