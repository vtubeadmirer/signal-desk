import { preferenceTokens } from "./negativePreferences";
import { normalizedTitle, rejectionId } from "./rejections";
import type { ArticleRecord, Candidate } from "./types";

export type PriorBroadcast = { date: string; title: string; reason: "url" | "title" | "topic" };

/**
 * Did this story (or one that reads like it) already go on air? Checks saved
 * records that carry broadcast dates: same URL, same normalized title, or a
 * strong token overlap within the last `windowDays`.
 */
export function findPriorBroadcast(item: Pick<Candidate, "url" | "title">, records: ArticleRecord[], today: string, windowDays = 14): PriorBroadcast | null {
  const id = rejectionId(item.url);
  const title = normalizedTitle(item.title);
  const tokens = new Set(preferenceTokens(item.title));
  const cutoff = shiftDate(today, -windowDays);
  let best: PriorBroadcast | null = null;
  for (const record of records) {
    const dates = record.broadcastDates.filter((date) => date <= today && date >= cutoff).sort();
    if (!dates.length) continue;
    const date = dates[dates.length - 1];
    let reason: PriorBroadcast["reason"] | null = null;
    if (rejectionId(record.candidate.url) === id) reason = "url";
    else if ([...title].length >= 8 && normalizedTitle(record.candidate.title) === title) reason = "title";
    else if (tokens.size >= 3) {
      const shared = preferenceTokens(record.candidate.title).filter((token) => tokens.has(token));
      if (shared.length >= 3) reason = "topic";
    }
    if (!reason) continue;
    const rank = { url: 0, title: 1, topic: 2 };
    if (!best || rank[reason] < rank[best.reason] || (rank[reason] === rank[best.reason] && date > best.date)) {
      best = { date, title: record.candidate.title, reason };
    }
  }
  return best;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}
