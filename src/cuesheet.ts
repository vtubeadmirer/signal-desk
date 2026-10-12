import { candidateStream } from "./streams";
import type { ArticleRecord } from "./types";

/** Plain-text/markdown run sheet for one broadcast date; pasteable into any notes or OBS text source. */
export function buildCueSheet(records: ArticleRecord[], date: string): string {
  const planned = records
    .filter((record) => record.broadcastDates.includes(date))
    .sort((a, b) => b.candidate.score - a.candidate.score);
  const lines: string[] = [`# 방송 큐시트 — ${date}`, "", `총 ${planned.length}건 · Signal Desk에서 내보냄`, ""];
  planned.forEach((record, index) => {
    const item = record.candidate;
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push(`- 출처: ${item.source_name} · ${candidateStream(item) === "news" ? "일반 뉴스" : "커뮤니티·밈"} · ${item.category} · 점수 ${item.score}`);
    lines.push(`- 링크: ${item.url}`);
    const summary = (item.why_now?.trim() || item.summary?.trim() || "").replace(/\s+/g, " ");
    if (summary) lines.push(`- 요약: ${summary.length > 240 ? `${summary.slice(0, 240).trimEnd()}…` : summary}`);
    if (item.discussion_points?.length) {
      lines.push("- 얘기할 포인트:");
      for (const point of item.discussion_points.slice(0, 5)) lines.push(`  - ${point}`);
    }
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
  });
  if (!planned.length) lines.push("이 날짜에 담긴 기사가 없습니다.", "");
  return lines.join("\n");
}
