import { rejectionValid, learningValid, MAX_REJECTIONS, type RejectedItem, type LearningSettings } from "./rejections";
import { watchlistValid } from "./watchlist";
import { collectionEntryValid, LOG_MAX, type CollectionEntry } from "./weekly";
import type { ArticleRecord, Candidate, Source } from "./types";

export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
export type DeskBackup = {
  format: "signal-desk-backup";
  version: 1;
  exportedAt: string;
  articles: ArticleRecord[];
  sources: Source[];
  provider: "codex" | "claude" | "gemini";
  selectedBroadcastDate: string;
  rejectedItems?: RejectedItem[];
  rejectionLearning?: LearningSettings;
  watchlist?: string[];
  collectionLog?: CollectionEntry[];
  routineOnLaunch?: boolean;
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown, limit = 4000): value is string =>
  typeof value === "string" && value.length <= limit;
const strings = (value: unknown, limit = 250): value is string[] =>
  Array.isArray(value) && value.length <= limit && value.every((v) => string(v));
const date = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown): value is string =>
  string(value, 100) && !Number.isNaN(Date.parse(value));

function https(value: unknown): value is string {
  if (!string(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443");
  } catch { return false; }
}

function talkValid(value: unknown): boolean {
  if (!object(value)) return false;
  if (!["debate", "empathy", "info"].includes(String(value.profile))) return false;
  if (!string(value.intro, 500) || !string(value.keyword, 100) || !strings(value.questions, 5)) return false;
  if (value.poll === null || value.poll === undefined) return true;
  return object(value.poll) && string(value.poll.question, 500) && strings(value.poll.options, 4);
}

export function reactionsValid(value: unknown): value is Record<string, "hot" | "flat" | "skipped"> {
  if (!object(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 1000 && entries.every(([key, reaction]) => date(key) && ["hot", "flat", "skipped"].includes(String(reaction)));
}

export function candidateValid(value: unknown): value is Candidate {
  if (!object(value)) return false;
  if (!["priority", "slide_order", "score", "score_raw", "talkability", "verification_cost", "context_required", "source_count"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0)) return false;
  if (!["category", "event_id", "title", "summary", "source_name", "published_at"].every((key) => string(value[key]))) return false;
  if (!https(value.url) || !strings(value.keywords) || !strings(value.frames) || typeof value.source_ready !== "boolean") return false;
  if (!["candidate", "manual_review", "exclude"].includes(String(value.decision))) return false;
  if (!["news", "official", "community", "trend", "meme", "rumor"].includes(String(value.content_type))) return false;
  if (!["media", "official", "community"].includes(String(value.source_type))) return false;
  if (!["rss", "api", "approved_feed", "manual", "public_list"].includes(String(value.collection_method))) return false;
  if (!["official_feed", "review_required", "permission_required", "blocked"].includes(String(value.usage_status))) return false;
  for (const key of ["confirmed_facts", "discussion_points", "caveats"]) {
    if (value[key] !== undefined && !strings(value[key])) return false;
  }
  if (value.why_now !== undefined && !string(value.why_now)) return false;
  if (value.negative_matches !== undefined && !strings(value.negative_matches)) return false;
  if (value.watch_matches !== undefined && !strings(value.watch_matches)) return false;
  if (value.talk !== undefined && !talkValid(value.talk)) return false;
  if (value.hook !== undefined && !string(value.hook, 200)) return false;
  if (value.chat_questions !== undefined && !strings(value.chat_questions, 5)) return false;
  if (value.poll !== undefined && !(object(value.poll) && string(value.poll.question, 200) && strings(value.poll.options, 4))) return false;
  if (value.debate !== undefined && !(object(value.debate) && string(value.debate.pro, 400) && string(value.debate.con, 400))) return false;
  if (value.personal_prompt !== undefined && !string(value.personal_prompt, 300)) return false;
  if (value.segment !== undefined && !string(value.segment, 40)) return false;
  if (value.talk_minutes !== undefined && (typeof value.talk_minutes !== "number" || !Number.isFinite(value.talk_minutes) || value.talk_minutes < 0 || value.talk_minutes > 60)) return false;
  if (value.domestic_emergency !== undefined && typeof value.domestic_emergency !== "boolean") return false;
  for (const key of ["score_before_negative", "negative_penalty"]) if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 100)) return false;
  if (value.engagement !== undefined && value.engagement !== null) {
    if (!object(value.engagement) || !["recommendations", "comments", "views"].every((key) => typeof (value.engagement as Record<string, unknown>)[key] === "number")) return false;
  }
  return true;
}

export function sourceValid(value: unknown): value is Source {
  return object(value) && string(value.name, 200) && https(value.url) &&
    ["official", "professional", "approved_feed"].includes(String(value.tier)) &&
    string(value.category, 100) && typeof value.enabled === "boolean" &&
    (value.kind === undefined || ["rss", "community"].includes(String(value.kind)));
}

export function parseBackup(raw: string): DeskBackup {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error("백업 파일은 4MB 이하여야 합니다.");
  const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (!object(value) || value.format !== "signal-desk-backup" || value.version !== 1) throw new Error("지원하는 Signal Desk 백업 파일이 아닙니다.");
  if (!timestamp(value.exportedAt) || !["codex", "claude", "gemini"].includes(value.provider as string) || !date(value.selectedBroadcastDate)) throw new Error("백업 설정이나 날짜가 올바르지 않습니다.");
  if (!Array.isArray(value.sources) || value.sources.length > 50 || !value.sources.every(sourceValid)) throw new Error("백업의 수집 소스가 올바르지 않습니다.");
  if (!Array.isArray(value.articles) || value.articles.length > 2000) throw new Error("백업의 기사 목록이 올바르지 않습니다.");
  if (value.rejectedItems !== undefined && (!Array.isArray(value.rejectedItems) || value.rejectedItems.length > MAX_REJECTIONS || !value.rejectedItems.every(rejectionValid) || new Set(value.rejectedItems.map((item) => item.id)).size !== value.rejectedItems.length)) throw new Error("백업의 제외 목록이 올바르지 않습니다.");
  if (value.rejectionLearning !== undefined && !learningValid(value.rejectionLearning)) throw new Error("백업의 제외 성향 설정이 올바르지 않습니다.");
  if (value.watchlist !== undefined && !watchlistValid(value.watchlist)) throw new Error("백업의 워치리스트가 올바르지 않습니다.");
  if (value.collectionLog !== undefined && (!Array.isArray(value.collectionLog) || value.collectionLog.length > LOG_MAX || !value.collectionLog.every(collectionEntryValid))) throw new Error("백업의 수집 기록이 올바르지 않습니다.");
  if (value.routineOnLaunch !== undefined && typeof value.routineOnLaunch !== "boolean") throw new Error("백업의 루틴 설정이 올바르지 않습니다.");
  const ids = new Set<string>();
  for (const record of value.articles) {
    if (!object(record) || !string(record.id, 2048) || !candidateValid(record.candidate) ||
        typeof record.interested !== "boolean" || !strings(record.labels, 20) || !string(record.note, 1000) ||
        !Array.isArray(record.broadcastDates) || record.broadcastDates.length > 1000 || !record.broadcastDates.every(date) ||
        !timestamp(record.savedAt) || !timestamp(record.updatedAt)) throw new Error("백업의 기사·메모·방송 날짜 형식이 올바르지 않습니다.");
    if (record.reactions !== undefined && !reactionsValid(record.reactions)) throw new Error("백업의 방송 반응 기록이 올바르지 않습니다.");
    const expected = record.candidate.url.trim().split("#", 1)[0].replace(/\/+$/, "");
    if (record.id !== expected || ids.has(record.id)) throw new Error("백업에 잘못된 기사 ID 또는 중복 기사가 있습니다.");
    ids.add(record.id);
  }
  return value as DeskBackup;
}

export function serializeBackup(data: Omit<DeskBackup, "format" | "version" | "exportedAt">): string {
  const raw = JSON.stringify({ format: "signal-desk-backup", version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
  parseBackup(raw);
  return raw;
}

