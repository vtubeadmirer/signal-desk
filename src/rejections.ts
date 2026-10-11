import type { Candidate } from "./types";
import type { SignalStream } from "./streams";

export type RejectedItem = {
  id: string;
  url: string;
  title: string;
  source_name: string;
  stream: SignalStream;
  rejectedAt: string;
};
export const MAX_REJECTIONS = 1000;
export const rejectionId = (url: string) => url.trim().split("#", 1)[0].replace(/\/+$/, "");
export const normalizedTitle = (title: string) => title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function rejectionValid(value: unknown): value is RejectedItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.url !== "string" || item.url.length > 2048 || typeof item.id !== "string" || item.id !== rejectionId(item.url)) return false;
  try {
    const url = new URL(item.url);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  } catch { return false; }
  return typeof item.title === "string" && item.title.length <= 500 && typeof item.source_name === "string" && item.source_name.length <= 200 &&
    (item.stream === "news" || item.stream === "community") && typeof item.rejectedAt === "string" && item.rejectedAt.length <= 100 && !Number.isNaN(Date.parse(item.rejectedAt));
}

export function rejectionIndex(items: RejectedItem[]) {
  return {
    urls: new Set(items.map((item) => item.id)),
    titles: new Set(items.map((item) => normalizedTitle(item.title)).filter((title) => [...title].length >= 8)),
  };
}

export function isRejected(item: Pick<Candidate, "url" | "title">, index: ReturnType<typeof rejectionIndex>): boolean {
  return index.urls.has(rejectionId(item.url)) || index.titles.has(normalizedTitle(item.title));
}

export function addRejections(current: RejectedItem[], items: RejectedItem[]): RejectedItem[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of items) {
    if (!rejectionValid(item)) throw new Error("제외할 자료의 형식이 올바르지 않습니다.");
    if (!merged.has(item.id)) merged.set(item.id, item);
  }
  if (merged.size > MAX_REJECTIONS) throw new Error("제외 목록은 최대 1,000개입니다. 환경설정에서 제외 목록을 정리하세요.");
  return [...merged.values()];
}

export async function exclusionHashes(items: RejectedItem[]): Promise<string[]> {
  const index = rejectionIndex(items);
  const keys = [...[...index.urls].map((url) => "u:" + url), ...[...index.titles].map((title) => "t:" + title)];
  return Promise.all(keys.map(async (key) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }));
}
