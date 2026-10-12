import { sourceValid } from "./backup";
import { DEFAULT_LEARNING, learningValid, rejectionValid, MAX_REJECTIONS, type LearningSettings, type RejectedItem } from "./rejections";
import { ARTICLES_KEY, COMMUNITY_MIGRATION_KEY, DATE_KEY, DEFAULT_SOURCES, LEARNING_KEY, PROVIDER_KEY, REJECTIONS_KEY, STORAGE_KEY, localDateKey } from "./storage";
import type { ArticleRecord, Source } from "./types";

/** Everything Signal Desk persists between launches, as one document. */
export type DeskState = {
  version: 1;
  sources: Source[];
  provider: string;
  articles: ArticleRecord[];
  rejectedItems: RejectedItem[];
  rejectionLearning: LearningSettings;
  selectedBroadcastDate: string;
  /** Community presets were offered once to users who predate them. */
  communityPresetsApplied: boolean;
};

export const MAX_ARTICLES = 5000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function articleRecordValid(item: unknown): item is ArticleRecord {
  return object(item) && typeof item.id === "string" && object(item.candidate) && typeof item.candidate.url === "string" &&
    typeof item.interested === "boolean" && Array.isArray(item.labels) && Array.isArray(item.broadcastDates) && typeof item.note === "string";
}

export function defaultState(): DeskState {
  return {
    version: 1,
    sources: DEFAULT_SOURCES.map((source) => ({ ...source })),
    provider: "codex",
    articles: [],
    rejectedItems: [],
    rejectionLearning: DEFAULT_LEARNING,
    selectedBroadcastDate: localDateKey(),
    communityPresetsApplied: true,
  };
}

/** Accept whatever fields are valid and fall back per field, so one bad entry never wipes the rest. */
export function sanitizeState(value: unknown): DeskState {
  const base = defaultState();
  if (!object(value)) return base;
  const sources = Array.isArray(value.sources) && value.sources.length <= 50 && value.sources.every(sourceValid) ? value.sources : base.sources;
  const articles = Array.isArray(value.articles) ? value.articles.filter(articleRecordValid).slice(0, MAX_ARTICLES) : [];
  const rejectedItems = Array.isArray(value.rejectedItems) ? value.rejectedItems.filter(rejectionValid).slice(0, MAX_REJECTIONS) : [];
  return {
    version: 1,
    sources,
    provider: value.provider === "codex" ? "codex" : base.provider,
    articles,
    rejectedItems,
    rejectionLearning: learningValid(value.rejectionLearning) ? value.rejectionLearning : DEFAULT_LEARNING,
    selectedBroadcastDate: typeof value.selectedBroadcastDate === "string" && DATE.test(value.selectedBroadcastDate) ? value.selectedBroadcastDate : base.selectedBroadcastDate,
    communityPresetsApplied: typeof value.communityPresetsApplied === "boolean" ? value.communityPresetsApplied : true,
  };
}

type LegacyStorage = Pick<Storage, "getItem">;

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Read the pre-0.5 per-key localStorage layout. Returns null when nothing was ever stored. */
export function migrateLegacyStorage(storage: LegacyStorage): DeskState | null {
  const keys = [STORAGE_KEY, PROVIDER_KEY, ARTICLES_KEY, LEARNING_KEY, REJECTIONS_KEY, DATE_KEY];
  if (!keys.some((key) => storage.getItem(key) !== null)) return null;
  return sanitizeState({
    sources: parse(storage.getItem(STORAGE_KEY)) ?? undefined,
    provider: storage.getItem(PROVIDER_KEY) ?? undefined,
    articles: parse(storage.getItem(ARTICLES_KEY)) ?? undefined,
    rejectedItems: parse(storage.getItem(REJECTIONS_KEY)) ?? undefined,
    rejectionLearning: parse(storage.getItem(LEARNING_KEY)) ?? undefined,
    selectedBroadcastDate: storage.getItem(DATE_KEY) ?? undefined,
    communityPresetsApplied: storage.getItem(COMMUNITY_MIGRATION_KEY) === "1",
  });
}

export function serializeState(state: DeskState): string {
  return JSON.stringify(state);
}
