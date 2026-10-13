import { candidateStream } from "./streams";
import { findPriorBroadcast } from "./history";
import type { ArticleRecord, Candidate } from "./types";

/** Corner (segment) for a story: the AI's pick when present, else from the rule-based profile. */
export const SEGMENT_ORDER = ["뉴스 브리핑", "밈 리뷰", "사연·내 경험", "찬반 토론", "시청자 투표", "기타"] as const;
const SEGMENT_MINUTES: Record<string, number> = { "뉴스 브리핑": 3, "밈 리뷰": 3, "사연·내 경험": 5, "찬반 토론": 8, "시청자 투표": 4, "기타": 4 };

export function segmentOf(item: Candidate): string {
  if (item.segment && (SEGMENT_ORDER as readonly string[]).includes(item.segment)) return item.segment;
  if (candidateStream(item) === "community") return item.talk?.profile === "debate" ? "찬반 토론" : "밈 리뷰";
  if (item.talk?.profile === "debate") return "찬반 토론";
  if (item.talk?.profile === "empathy") return "사연·내 경험";
  return "뉴스 브리핑";
}

export function segmentMinutes(item: Candidate): number {
  return item.talk_minutes && item.talk_minutes > 0 ? item.talk_minutes : SEGMENT_MINUTES[segmentOf(item)] ?? 4;
}

/** "질문? 1 보기 2 보기 3 보기" — the shape chat polls on Chzzk/SOOP/YouTube accept when pasted. */
export function pollText(poll: { question: string; options: string[] }): string {
  return `${poll.question} ${poll.options.map((option, index) => `${index + 1} ${option}`).join("  ")}`;
}

/** Plain-text/markdown run sheet for one broadcast date; pasteable into any notes or OBS text source. */
export function buildCueSheet(records: ArticleRecord[], date: string): string {
  const planned = records
    .filter((record) => record.broadcastDates.includes(date))
    .sort((a, b) => b.candidate.score - a.candidate.score);
  const totalMinutes = planned.reduce((sum, record) => sum + segmentMinutes(record.candidate), 0);
  const lines: string[] = [`# 방송 큐시트 — ${date}`, "", `총 ${planned.length}건 · 약 ${totalMinutes}분 · Signal Desk에서 내보냄`, ""];
  const groups = new Map<string, ArticleRecord[]>();
  for (const record of planned) {
    const segment = segmentOf(record.candidate);
    groups.set(segment, [...(groups.get(segment) ?? []), record]);
  }
  let index = 0;
  for (const segment of SEGMENT_ORDER) {
    const members = groups.get(segment);
    if (!members?.length) continue;
    lines.push(`## 코너 — ${segment} (약 ${members.reduce((sum, record) => sum + segmentMinutes(record.candidate), 0)}분)`, "");
    for (const record of members) {
    const item = record.candidate;
    index += 1;
    lines.push(`### ${index}. ${item.title}`);
    if (item.hook) lines.push(`- 오프닝: ${item.hook}`);
    const prior = findPriorBroadcast(item, records.filter((other) => other.id !== record.id), date);
    if (prior && prior.date < date) lines.push(`- 이어서: ${prior.date} 「${prior.title}」${prior.note ? ` / 내 메모: ${prior.note.replace(/\r?\n/g, " / ")}` : ""}${prior.reaction === "hot" ? " / 지난번 반응 좋았음" : ""}`);
    lines.push(`- 출처: ${item.source_name} · ${candidateStream(item) === "news" ? "일반 뉴스" : "커뮤니티·밈"} · ${item.category} · 점수 ${item.score}`);
    lines.push(`- 링크: ${item.url}`);
    const summary = (item.why_now?.trim() || item.summary?.trim() || "").replace(/\s+/g, " ");
    if (summary) lines.push(`- 요약: ${summary.length > 240 ? `${summary.slice(0, 240).trimEnd()}…` : summary}`);
    if (item.discussion_points?.length) {
      lines.push("- 얘기할 포인트:");
      for (const point of item.discussion_points.slice(0, 5)) lines.push(`  - ${point}`);
    }
    const questions = item.chat_questions?.length ? item.chat_questions : item.talk?.questions ?? [];
    if (questions.length) {
      lines.push(`- 채팅에 던질 질문${!item.chat_questions?.length && item.talk?.intro ? ` (${item.talk.intro})` : ""}:`);
      for (const question of questions.slice(0, 3)) lines.push(`  - ${question}`);
    }
    const poll = item.poll ?? item.talk?.poll;
    if (poll) lines.push(`- 투표: ${pollText(poll)}`);
    if (item.debate) lines.push(`- 찬반: 찬성 측 — ${item.debate.pro} / 반대 측 — ${item.debate.con}`);
    if (item.personal_prompt) lines.push(`- 내 경험 유도: ${item.personal_prompt}`);
    if (item.confirmed_facts?.length) {
      lines.push("- 자료에서 확인한 내용:");
      for (const fact of item.confirmed_facts.slice(0, 5)) lines.push(`  - ${fact}`);
    }
    if (item.caveats?.length) {
      lines.push("- 방송 전 확인:");
      for (const caveat of item.caveats.slice(0, 5)) lines.push(`  - ${caveat}`);
    }
    if (record.labels.length) lines.push(`- 내 분류: ${record.labels.join(", ")}`);
    if (record.note.trim()) lines.push(`- 메모: ${record.note.trim().replace(/\r?\n/g, " / ")}`);
    lines.push("");
    }
  }
  if (!planned.length) lines.push("이 날짜에 담긴 기사가 없습니다.", "");
  return lines.join("\n");
}
