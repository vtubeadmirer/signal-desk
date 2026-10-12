import type { Candidate } from "./types";

/** Terms the user always wants surfaced (a streamer, a game, a company), regardless of score. */
export const MAX_WATCHLIST = 50;
export const MAX_WATCH_TERM = 40;

export function normalizeWatchTerm(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function watchlistValid(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_WATCHLIST &&
    value.every((term) => typeof term === "string" && term.length >= 2 && term.length <= MAX_WATCH_TERM && term === normalizeWatchTerm(term));
}

/** Add a term, ignoring duplicates (case-insensitive) and empty input; returns the unchanged list when invalid. */
export function addWatchTerm(current: string[], raw: string): string[] {
  const term = normalizeWatchTerm(raw);
  if (term.length < 2 || term.length > MAX_WATCH_TERM) return current;
  if (current.some((existing) => existing.toLowerCase() === term.toLowerCase())) return current;
  if (current.length >= MAX_WATCHLIST) return current;
  return [...current, term];
}

export function watchMatches(item: Pick<Candidate, "title" | "summary">, watchlist: string[]): string[] {
  if (!watchlist.length) return [];
  const text = `${item.title} ${item.summary ?? ""}`.normalize("NFKC").toLowerCase();
  return watchlist.filter((term) => text.includes(term.toLowerCase()));
}
