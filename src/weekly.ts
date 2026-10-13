import { preferenceTokens } from "./negativePreferences";
import { rejectionId } from "./rejections";
import { candidateStream, type SignalStream } from "./streams";
import type { ArticleRecord, Candidate } from "./types";

/**
 * One line per top-20 candidate per collection run. Small on purpose: this is
 * the memory that turns a daily tool into a weekly one (what kept coming back,
 * what spiked, what was never picked up).
 */
export type CollectionEntry = {
  date: string;            // YYYY-MM-DD, local day of the collection
  stream: SignalStream;
  id: string;              // rejectionId(url)
  title: string;
  url: string;
  category: string;
  score: number;
  source_count: number;
  watch: boolean;          // watchlist hit at the time
  comments?: number;       // community engagement snapshot
  recommendations?: number;
};

export const LOG_DAYS = 30;
export const LOG_MAX = 2000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function collectionEntryValid(value: unknown): value is CollectionEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  return typeof v.date === "string" && DATE.test(v.date) && (v.stream === "news" || v.stream === "community") &&
    typeof v.id === "string" && v.id.length <= 2048 && typeof v.title === "string" && v.title.length <= 500 &&
    typeof v.url === "string" && v.url.length <= 2048 && typeof v.category === "string" && v.category.length <= 100 &&
    num(v.score) && num(v.source_count) && typeof v.watch === "boolean" &&
    (v.comments === undefined || num(v.comments)) && (v.recommendations === undefined || num(v.recommendations));
}

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Drop entries older than LOG_DAYS and cap the total, newest first. Entries dated after `today` (clock skew, restored backup) are kept. */
export function pruneLog(log: CollectionEntry[], today: string): CollectionEntry[] {
  const cutoff = shiftDate(today, -LOG_DAYS);
  return log.filter((entry) => entry.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score)
    .slice(0, LOG_MAX);
}

/** Merge one run's candidates into the log; the same story on the same day is replaced, not duplicated. */
export function appendRun(log: CollectionEntry[], candidates: Candidate[], stream: SignalStream, date: string): CollectionEntry[] {
  const fresh = new Map<string, CollectionEntry>();
  for (const item of candidates) {
    if (candidateStream(item) !== stream) continue;
    fresh.set(rejectionId(item.url), {
      date, stream, id: rejectionId(item.url), title: item.title, url: item.url, category: item.category,
      score: item.score, source_count: item.source_count, watch: Boolean(item.watch_matches?.length),
      ...(item.engagement ? { comments: item.engagement.comments, recommendations: item.engagement.recommendations } : {}),
    });
  }
  const kept = log.filter((entry) => !(entry.date === date && entry.stream === stream && fresh.has(entry.id)));
  return pruneLog([...kept, ...fresh.values()], date);
}

export type TermTrend = { term: string; days: number; thisWeek: number; lastWeek: number; titles: string[]; lastSeen: string };

export type WeeklyReport = {
  from: string;
  to: string;
  runs: number;                 // distinct collection days this week
  persistent: TermTrend[];      // seen on 3+ days this week
  risers: TermTrend[];          // mentions up vs. previous 7 days
  newcomers: TermTrend[];       // not seen last week at all
  aired: ArticleRecord[];       // broadcast this week
  missed: CollectionEntry[];    // strong candidates never saved or aired
  bySource: { source: string; count: number }[];
};

const MIN_TERM_DAYS = 2;

function termStats(entries: CollectionEntry[]): Map<string, { days: Set<string>; titles: Set<string>; lastSeen: string }> {
  const stats = new Map<string, { days: Set<string>; titles: Set<string>; lastSeen: string }>();
  for (const entry of entries) {
    for (const term of new Set(preferenceTokens(entry.title))) {
      const s = stats.get(term) ?? { days: new Set(), titles: new Set(), lastSeen: "" };
      s.days.add(entry.date);
      if (s.titles.size < 3) s.titles.add(entry.title);
      if (entry.date > s.lastSeen) s.lastSeen = entry.date;
      stats.set(term, s);
    }
  }
  return stats;
}

/** Pure weekly digest over the collection log and saved records. `today` is inclusive; the week is the last 7 days. */
export function weeklyReport(log: CollectionEntry[], records: ArticleRecord[], today: string): WeeklyReport {
  const from = shiftDate(today, -6);
  const prevFrom = shiftDate(today, -13);
  const thisWeek = log.filter((e) => e.date >= from && e.date <= today);
  const lastWeek = log.filter((e) => e.date >= prevFrom && e.date < from);
  const now = termStats(thisWeek);
  const before = termStats(lastWeek);

  const trends: TermTrend[] = [...now.entries()].map(([term, s]) => ({
    term, days: s.days.size, thisWeek: s.days.size, lastWeek: before.get(term)?.days.size ?? 0, titles: [...s.titles], lastSeen: s.lastSeen,
  }));
  const persistent = trends.filter((t) => t.days >= 3).sort((a, b) => b.days - a.days || b.lastSeen.localeCompare(a.lastSeen)).slice(0, 12);
  const risers = trends.filter((t) => t.days >= MIN_TERM_DAYS && t.thisWeek > t.lastWeek).sort((a, b) => (b.thisWeek - b.lastWeek) - (a.thisWeek - a.lastWeek) || b.days - a.days).slice(0, 10);
  const newcomers = trends.filter((t) => t.days >= MIN_TERM_DAYS && t.lastWeek === 0).sort((a, b) => b.days - a.days).slice(0, 10);

  const aired = records.filter((r) => r.broadcastDates.some((d) => d >= from && d <= today)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const savedIds = new Set(records.map((r) => r.id));
  const seen = new Set<string>();
  const missed = thisWeek
    .filter((e) => !savedIds.has(e.id) && (e.watch || e.score >= 40 || e.source_count >= 2))
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => Number(b.watch) - Number(a.watch) || b.score - a.score)
    .slice(0, 10);

  const sourceCounts = new Map<string, number>();
  for (const r of aired) sourceCounts.set(r.candidate.source_name, (sourceCounts.get(r.candidate.source_name) ?? 0) + 1);
  const bySource = [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  return { from, to: today, runs: new Set(thisWeek.map((e) => e.date)).size, persistent, risers, newcomers, aired, missed, bySource };
}

/** Terms that kept coming back this week, for the 「N일째 화제」 badge on candidate cards. */
export function persistentTerms(log: CollectionEntry[], today: string): Map<string, number> {
  const from = shiftDate(today, -6);
  const stats = termStats(log.filter((e) => e.date >= from && e.date <= today));
  const out = new Map<string, number>();
  for (const [term, s] of stats) if (s.days.size >= 3) out.set(term, s.days.size);
  return out;
}

export function persistentHit(item: Pick<Candidate, "title">, terms: Map<string, number>): { term: string; days: number } | null {
  let best: { term: string; days: number } | null = null;
  for (const term of new Set(preferenceTokens(item.title))) {
    const days = terms.get(term);
    if (days && (!best || days > best.days)) best = { term, days };
  }
  return best;
}

/** Names that keep recurring in collections (3+ days, 2+ distinct stories) and are not on the watchlist yet. */
export function suggestWatchTerms(log: CollectionEntry[], watchlist: string[], today: string, days = 14): { term: string; days: number; stories: number }[] {
  const from = shiftDate(today, -(days - 1));
  const have = new Set(watchlist.map((t) => t.toLowerCase()));
  const stats = new Map<string, { days: Set<string>; ids: Set<string> }>();
  for (const entry of log) {
    if (entry.date < from || entry.date > today) continue;
    for (const term of new Set(preferenceTokens(entry.title))) {
      if (have.has(term.toLowerCase()) || term.length < 2) continue;
      const s = stats.get(term) ?? { days: new Set(), ids: new Set() };
      s.days.add(entry.date); s.ids.add(entry.id);
      stats.set(term, s);
    }
  }
  return [...stats.entries()].filter(([, s]) => s.days.size >= 3 && s.ids.size >= 2)
    .map(([term, s]) => ({ term, days: s.days.size, stories: s.ids.size }))
    .sort((a, b) => b.days - a.days || b.stories - a.stories).slice(0, 8);
}

/** Markdown recap for a weekly 「이번 주 정리」 segment or a community post. */
export function weeklyRecapMarkdown(report: WeeklyReport): string {
  const lines = [`# 이번 주 정리 — ${report.from} ~ ${report.to}`, "", `수집한 날 ${report.runs}일 · 방송한 주제 ${report.aired.length}건 · Signal Desk에서 내보냄`, ""];
  if (report.aired.length) {
    lines.push("## 이번 주 다룬 주제");
    report.aired.forEach((r, i) => lines.push(`${i + 1}. ${r.candidate.title} (${r.candidate.source_name}, ${r.broadcastDates.filter((d) => d >= report.from && d <= report.to).join(", ")})`));
    lines.push("");
  }
  if (report.persistent.length) {
    lines.push("## 이번 주 계속 올라온 이야기");
    for (const t of report.persistent) lines.push(`- ${t.term} — ${t.days}일 등장 · 예: ${t.titles[0] ?? ""}`);
    lines.push("");
  }
  if (report.risers.length) {
    lines.push("## 지난주보다 커진 이야기");
    for (const t of report.risers) lines.push(`- ${t.term} — 지난주 ${t.lastWeek}일 → 이번 주 ${t.thisWeek}일`);
    lines.push("");
  }
  if (report.newcomers.length) {
    lines.push("## 이번 주 처음 나온 이름");
    for (const t of report.newcomers) lines.push(`- ${t.term} (${t.days}일) · 예: ${t.titles[0] ?? ""}`);
    lines.push("");
  }
  if (report.missed.length) {
    lines.push("## 많이 떴는데 안 다룬 것 (다음 주 후보)");
    for (const e of report.missed) lines.push(`- ${e.title} (${e.date}, 점수 ${e.score}${e.watch ? ", 워치리스트" : ""}) ${e.url}`);
    lines.push("");
  }
  if (!report.aired.length && !report.persistent.length && !report.missed.length) lines.push("아직 이번 주 수집 기록이 충분하지 않습니다. 며칠 수집하면 흐름이 보입니다.", "");
  return lines.join("\n");
}
