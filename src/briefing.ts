import { findPriorBroadcast, type PriorBroadcast } from "./history";
import { candidateStream } from "./streams";
import { pollText, segmentOf } from "./cuesheet";
import { watchMatches } from "./watchlist";
import type { ArticleRecord, Candidate } from "./types";

/**
 * "오늘의 토크 N": turn up to 40 candidates (both streams) into the handful the
 * host will actually open with. Pure and deterministic so the same inputs give
 * the same briefing.
 *
 * Selection order: watchlist hits → one follow-up slot → everything else by
 * score, with at most `perCategory` per category and at least one community
 * story when any is available. Stories already aired (same link/title) are
 * skipped; carried-over stories (reaction "skipped" on an earlier date) go first.
 */
export type BriefingPick = { item: Candidate; reason: string; prior: PriorBroadcast | null };
export type Briefing = { picks: BriefingPick[]; alternates: Candidate[]; quota: number };

export const DEFAULT_QUOTA = 5;

export function buildBriefing(candidates: Candidate[], records: ArticleRecord[], watchlist: string[], today: string, quota = DEFAULT_QUOTA, perCategory = 2): Briefing {
  const aired = records.filter((record) => record.broadcastDates.length > 0);
  const picks: BriefingPick[] = [];
  const used = new Set<string>();
  const categoryCount = new Map<string, number>();
  const canTake = (item: Candidate) => !used.has(item.event_id) && (categoryCount.get(item.category) ?? 0) < perCategory;
  const take = (item: Candidate, reason: string, prior: PriorBroadcast | null) => {
    picks.push({ item, reason, prior });
    used.add(item.event_id);
    categoryCount.set(item.category, (categoryCount.get(item.category) ?? 0) + 1);
  };

  const priors = new Map(candidates.map((item) => [item.event_id, findPriorBroadcast(item, aired, today)] as const));
  const repeat = (item: Candidate) => { const p = priors.get(item.event_id); return Boolean(p && !p.followUp); };
  const byScore = [...candidates].sort((a, b) => b.score - a.score);

  // 1. carried over from a previous broadcast date ("못 다룸")
  for (const record of records) {
    const skippedDates = Object.entries(record.reactions ?? {}).filter(([, r]) => r === "skipped").map(([d]) => d);
    if (!skippedDates.length) continue;
    const match = byScore.find((item) => item.url === record.candidate.url && canTake(item));
    if (match && picks.length < quota) take(match, `지난 방송(${skippedDates.sort().pop()})에서 못 다룬 이야기`, priors.get(match.event_id) ?? null);
  }
  // 2. watchlist
  for (const item of byScore) {
    if (picks.length >= quota) break;
    if (canTake(item) && !repeat(item) && watchMatches(item, watchlist).length) take(item, `워치리스트: ${watchMatches(item, watchlist)[0]}`, priors.get(item.event_id) ?? null);
  }
  // 3. one follow-up slot
  const followUp = byScore.find((item) => canTake(item) && priors.get(item.event_id)?.followUp);
  if (followUp && picks.length < quota) take(followUp, `지난 방송(${priors.get(followUp.event_id)!.date}) 후속`, priors.get(followUp.event_id) ?? null);
  // 4. at least one community story
  if (picks.length < quota && !picks.some((p) => candidateStream(p.item) === "community")) {
    const community = byScore.find((item) => canTake(item) && !repeat(item) && candidateStream(item) === "community");
    if (community) take(community, "커뮤니티 화제", null);
  }
  // 5. fill by score, debate-friendly first when scores tie
  for (const item of byScore) {
    if (picks.length >= quota) break;
    if (canTake(item) && !repeat(item)) take(item, item.talk?.profile === "debate" ? "토론형 · 높은 점수" : "높은 점수", priors.get(item.event_id) ?? null);
  }
  const alternates = byScore.filter((item) => !used.has(item.event_id) && !repeat(item)).slice(0, 10);
  return { picks, alternates, quota };
}

/** Swap one pick for the next best alternate that keeps the category rule. */
export function replacePick(briefing: Briefing, eventId: string, perCategory = 2): Briefing {
  const index = briefing.picks.findIndex((p) => p.item.event_id === eventId);
  if (index < 0 || !briefing.alternates.length) return briefing;
  const counts = new Map<string, number>();
  for (const p of briefing.picks) if (p.item.event_id !== eventId) counts.set(p.item.category, (counts.get(p.item.category) ?? 0) + 1);
  const next = briefing.alternates.find((item) => (counts.get(item.category) ?? 0) < perCategory) ?? briefing.alternates[0];
  const picks = briefing.picks.map((p, i) => (i === index ? { item: next, reason: "교체", prior: p.prior && p.prior.title === next.title ? p.prior : null } : p));
  const alternates = [...briefing.alternates.filter((item) => item.event_id !== next.event_id), briefing.picks[index].item];
  return { ...briefing, picks, alternates };
}

export function briefingMarkdown(briefing: Briefing, date: string): string {
  const lines = [`# 오늘의 토크 ${briefing.picks.length} — ${date}`, ""];
  briefing.picks.forEach((pick, index) => {
    const item = pick.item;
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push(`- 왜 지금: ${pick.reason} · ${segmentOf(item)} · ${item.source_name}`);
    if (pick.prior) lines.push(`- 이어서: ${pick.prior.date} 「${pick.prior.title}」${pick.prior.note ? ` / 내 메모: ${pick.prior.note}` : ""}`);
    const summary = (item.why_now?.trim() || item.summary?.trim() || "").replace(/\s+/g, " ");
    if (summary) lines.push(`- 요약: ${summary.length > 200 ? `${summary.slice(0, 200).trimEnd()}…` : summary}`);
    const questions = item.chat_questions?.length ? item.chat_questions : item.talk?.questions ?? [];
    for (const q of questions.slice(0, 2)) lines.push(`- 질문: ${q}`);
    const poll = item.poll ?? item.talk?.poll;
    if (poll) lines.push(`- 투표: ${pollText(poll)}`);
    lines.push(`- 링크: ${item.url}`, "");
  });
  if (!briefing.picks.length) lines.push("아직 후보가 없습니다. 뉴스와 커뮤니티를 먼저 가져오세요.", "");
  return lines.join("\n");
}
