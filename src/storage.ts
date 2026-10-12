import type { ArticleRecord, Source } from "./types";

/** Pre-0.5 localStorage keys. Still read once by state.ts to migrate existing installs. */
export const STORAGE_KEY = "signal-desk:sources:v1";
export const PROVIDER_KEY = "signal-desk:provider:v1";
export const ARTICLES_KEY = "signal-desk:articles:v1";
export const LEARNING_KEY = "signal-desk:rejection-learning:v1";
export const REJECTIONS_KEY = "signal-desk:rejections:v1";
export const DATE_KEY = "signal-desk:broadcast-date:v1";
export const COMMUNITY_MIGRATION_KEY = "signal-desk:community-sources:v1";

export function articleId(url: string): string {
  return url.trim().split("#", 1)[0].replace(/\/+$/, "");
}

export function localDateKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSavedArticle(record: ArticleRecord): boolean {
  return Boolean(
    record.interested ||
    record.labels.length ||
    record.note.trim() ||
    record.broadcastDates.length
  );
}

export const COMMUNITY_SOURCES: Source[] = [
  { name: "디시 버츄얼 스트리머 개념글", url: "https://gall.dcinside.com/mini/board/lists/?id=virtual_streamer&exception_mode=recommend", kind: "community", tier: "approved_feed", category: "버튜버·크리에이터", enabled: true },
  { name: "디시 치지직 개념글", url: "https://gall.dcinside.com/mgallery/board/lists/?id=chzzk&exception_mode=recommend", kind: "community", tier: "approved_feed", category: "IT·플랫폼", enabled: true },
  { name: "디시 중세게임 개념글", url: "https://gall.dcinside.com/mgallery/board/lists/?id=aoegame&exception_mode=recommend", kind: "community", tier: "approved_feed", category: "게임·인터넷 방송", enabled: true },
  { name: "루리웹 유머 베스트", url: "https://bbs.ruliweb.com/best/humor", kind: "community", tier: "approved_feed", category: "커뮤니티·밈", enabled: true },
  { name: "펨코 포텐 화제순", url: "https://www.fmkorea.com/best2", kind: "community", tier: "approved_feed", category: "커뮤니티·밈", enabled: true },
];

export const DEFAULT_SOURCES: Source[] = [
  ...COMMUNITY_SOURCES,
  { name: "전자신문 IT", url: "https://rss.etnews.com/03.xml", tier: "professional", category: "IT·플랫폼", enabled: true },
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/news.xml", tier: "professional", category: "사회·생활", enabled: true },
  { name: "경향신문", url: "https://www.khan.co.kr/rss/rssdata/total_news.xml", tier: "professional", category: "사회·생활", enabled: true },
  { name: "동아일보", url: "https://rss.donga.com/total.xml", tier: "professional", category: "사회·생활", enabled: true },
  { name: "한겨레", url: "https://www.hani.co.kr/rss", tier: "professional", category: "사회·생활", enabled: true },
  { name: "IT동아", url: "https://it.donga.com/feeds/rss/", tier: "professional", category: "IT·플랫폼", enabled: true },
  { name: "테크M", url: "https://www.techm.kr/rss/allArticle.xml", tier: "professional", category: "IT·플랫폼", enabled: true },
  { name: "JTBC", url: "https://fs.jtbc.co.kr/RSS/newsflash.xml", tier: "professional", category: "사회·생활", enabled: true },
  { name: "SBS", url: "https://news.sbs.co.kr/news/SectionRssFeed.do?section=01", tier: "professional", category: "사회·생활", enabled: true },
];

export const CATEGORIES = ["전체", "사회·생활", "버튜버·크리에이터", "IT·플랫폼", "시청자 권리·안전", "게임·인터넷 방송", "커뮤니티·밈"];

export function summaryPreview(value?: string | null): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "요약이 제공되지 않은 기사입니다. 원문 링크에서 내용을 확인해 주세요.";
  }
  const limit = 320;
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
