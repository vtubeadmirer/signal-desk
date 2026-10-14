import { preferenceTokens } from "./negativePreferences";
import { pollText } from "./cuesheet";
import { watchMatches } from "./watchlist";
import type { ArticleRecord, Candidate } from "./types";
import type { CollectionEntry } from "./weekly";

/**
 * Keyword research: one topic, every article we can see about it, in time order.
 * Remote results come from the sidecar's `research` op (Google News RSS search);
 * local hits come from current candidates, the collection log and the archive.
 */
export type ResearchHit = {
  key: string;
  date: string;           // YYYY-MM-DD
  title: string;
  url: string;
  source: string;
  origin: "search" | "candidate" | "log" | "archive";
  candidate: Candidate | null;
  sourceCount: number;
  aired?: string[];       // broadcast dates when the hit comes from the archive
};

export type ResearchDay = { date: string; hits: ResearchHit[] };

export type ResearchView = {
  keyword: string;
  days: ResearchDay[];
  total: number;
  first: string | null;
  last: string | null;
  sources: { source: string; count: number }[];
  related: { term: string; count: number }[];
};

export function normalizeKeyword(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 60);
}

const dayOf = (iso: string) => (iso || "").slice(0, 10);

/** Google News titles end with " - 매체명"; split that off so the source column is useful. */
export function splitGoogleTitle(title: string): { title: string; source: string } {
  const match = title.match(/^(.*?)\s+-\s+([^-]{1,40})$/);
  return match ? { title: match[1].trim(), source: match[2].trim() } : { title: title.trim(), source: "" };
}

export function buildResearchView(keyword: string, remote: Candidate[], candidates: Candidate[], log: CollectionEntry[], records: ArticleRecord[]): ResearchView {
  const terms = [normalizeKeyword(keyword)].filter(Boolean);
  const hits = new Map<string, ResearchHit>();
  const put = (hit: ResearchHit) => {
    const existing = hits.get(hit.key);
    if (!existing) { hits.set(hit.key, hit); return; }
    // Prefer the richest origin: archive (has notes/dates) > candidate > search > log.
    const rank = { archive: 0, candidate: 1, search: 2, log: 3 };
    if (rank[hit.origin] < rank[existing.origin]) hits.set(hit.key, { ...hit, sourceCount: Math.max(hit.sourceCount, existing.sourceCount) });
    else existing.sourceCount = Math.max(existing.sourceCount, hit.sourceCount);
  };
  const keyFor = (title: string) => title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 60);

  for (const item of remote) {
    const parts = splitGoogleTitle(item.title);
    put({ key: keyFor(parts.title), date: dayOf(item.published_at), title: parts.title, url: item.url, source: parts.source || item.source_name, origin: "search", candidate: { ...item, title: parts.title, source_name: parts.source || item.source_name }, sourceCount: item.source_count });
  }
  for (const item of candidates) {
    if (!watchMatches(item, terms).length) continue;
    put({ key: keyFor(item.title), date: dayOf(item.published_at), title: item.title, url: item.url, source: item.source_name, origin: "candidate", candidate: item, sourceCount: item.source_count });
  }
  for (const entry of log) {
    if (!watchMatches({ title: entry.title, summary: "" }, terms).length) continue;
    put({ key: keyFor(entry.title), date: entry.date, title: entry.title, url: entry.url, source: "", origin: "log", candidate: null, sourceCount: entry.source_count });
  }
  for (const record of records) {
    if (!watchMatches(record.candidate, terms).length) continue;
    put({ key: keyFor(record.candidate.title), date: dayOf(record.candidate.published_at), title: record.candidate.title, url: record.candidate.url, source: record.candidate.source_name, origin: "archive", candidate: record.candidate, sourceCount: record.candidate.source_count, aired: record.broadcastDates });
  }

  const all = [...hits.values()].filter((h) => h.date).sort((a, b) => b.date.localeCompare(a.date) || b.sourceCount - a.sourceCount);
  const byDay = new Map<string, ResearchHit[]>();
  for (const hit of all) byDay.set(hit.date, [...(byDay.get(hit.date) ?? []), hit]);
  const days = [...byDay.entries()].map(([date, dayHits]) => ({ date, hits: dayHits }));

  const sourceCounts = new Map<string, number>();
  for (const hit of all) if (hit.source) sourceCounts.set(hit.source, (sourceCounts.get(hit.source) ?? 0) + 1);
  const sources = [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const keywordTokens = new Set(preferenceTokens(keyword).map((t) => t.toLowerCase()));
  const termCounts = new Map<string, number>();
  for (const hit of all) for (const term of new Set(preferenceTokens(hit.title))) {
    if (keywordTokens.has(term.toLowerCase()) || keyword.toLowerCase().includes(term.toLowerCase())) continue;
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }
  const related = [...termCounts.entries()].filter(([, c]) => c >= 2).map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  return { keyword, days, total: all.length, first: all.length ? all[all.length - 1].date : null, last: all.length ? all[0].date : null, sources, related };
}

export function researchMarkdown(view: ResearchView): string {
  const lines = [`# 리서치 — ${view.keyword}`, "", `${view.total}건 · ${view.first ?? "?"} ~ ${view.last ?? "?"}${view.sources.length ? ` · 출처: ${view.sources.map((s) => `${s.source} ${s.count}`).join(", ")}` : ""}`, ""];
  if (view.related.length) lines.push(`연관어: ${view.related.map((r) => r.term).join(", ")}`, "");
  for (const day of view.days) {
    lines.push(`## ${day.date}`);
    for (const hit of day.hits) {
      lines.push(`- ${hit.title}${hit.source ? ` (${hit.source})` : ""}${hit.sourceCount > 1 ? ` · 출처 ${hit.sourceCount}` : ""}${hit.aired?.length ? ` · 방송 ${hit.aired.join(", ")}` : ""}`);
      lines.push(`  ${hit.url}`);
      const poll = hit.candidate?.talk?.poll;
      if (hit.candidate?.talk?.questions?.[0]) lines.push(`  질문: ${hit.candidate.talk.questions[0]}`);
      if (poll) lines.push(`  투표: ${pollText(poll)}`);
    }
    lines.push("");
  }
  if (!view.total) lines.push("관련 기사를 찾지 못했습니다.", "");
  return lines.join("\n");
}
