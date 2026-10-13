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

export type SortMode = "score" | "chat";

/**
 * How likely chat is to light up: talkability plus the engagement profile,
 * frames that invite argument, community comment volume and watchlist hits.
 */
export function chatScore(item: Candidate): number {
  let score = item.talkability ?? 0;
  if (item.talk?.profile === "debate") score += 20;
  else if (item.talk?.profile === "empathy") score += 10;
  score += Math.min(15, (item.frames?.length ?? 0) * 5);
  if (item.engagement) score += Math.min(30, Math.round(item.engagement.comments / 5));
  if (item.watch_matches?.length) score += 15;
  if (item.chat_questions?.length || item.poll) score += 5;
  return Math.min(150, score);
}

/** Stream + category filter, watchlist hits first, then score (or chat score); capped at 20. */
export function streamCandidates(items: Candidate[], stream: SignalStream, category = "전체", watchlist: string[] = [], sort: SortMode = "score"): Candidate[] {
  const key = sort === "chat" ? chatScore : (item: Candidate) => item.score;
  return items.filter((item) => candidateStream(item) === stream && (category === "전체" || item.category === category))
    .map((item) => ({ item, watched: watchMatches(item, watchlist).length > 0 }))
    .sort((a, b) => Number(b.watched) - Number(a.watched) || key(b.item) - key(a.item) || b.item.score - a.item.score)
    .map(({ item }) => item)
    .slice(0, 20);
}

export function replaceStream(items: Candidate[], incoming: Candidate[], stream: SignalStream): Candidate[] {
  return [...items.filter((item) => candidateStream(item) !== stream), ...incoming.filter((item) => candidateStream(item) === stream)];
}
