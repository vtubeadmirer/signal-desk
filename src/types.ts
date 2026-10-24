export type Source = {
  kind?: "rss" | "community";
  name: string;
  url: string;
  tier: "official" | "professional" | "approved_feed";
  category: string;
  enabled: boolean;
};

/** Rule-based just-chatting angle computed by the sidecar (no AI). */
export type TalkAngles = {
  profile: "debate" | "empathy" | "info";
  intro: string;
  keyword: string;
  questions: string[];
  poll: { question: string; options: string[] } | null;
};

export type Candidate = {
  priority: number;
  slide_order: number;
  category: string;
  event_id: string;
  decision: "candidate" | "manual_review" | "exclude";
  content_type: "news" | "official" | "community" | "trend" | "meme" | "rumor";
  source_type: "media" | "official" | "community";
  collection_method: "rss" | "api" | "approved_feed" | "manual" | "public_list";
  usage_status: "official_feed" | "review_required" | "permission_required" | "blocked";
  score: number;
  score_raw: number;
  score_before_negative?: number;
  negative_penalty?: number;
  negative_matches?: string[];
  domestic_emergency?: boolean;
  personalization_bonus?: number;
  political_penalty?: boolean;
  talkability: number;
  verification_cost: number;
  source_ready: boolean;
  context_required: number;
  title: string;
  summary: string;
  source_name: string;
  url: string;
  published_at: string;
  keywords: string[];
  source_count: number;
  frames: string[];
  engagement?: { recommendations: number; comments: number; views: number } | null;
  watch_matches?: string[];
  talk?: TalkAngles;
  /** Optional live-show fields from AI analysis (see schemas/analysis.schema.json). */
  hook?: string;
  chat_questions?: string[];
  poll?: { question: string; options: string[] };
  debate?: { pro: string; con: string };
  personal_prompt?: string;
  segment?: string;
  talk_minutes?: number;
  why_now?: string;
  confirmed_facts?: string[];
  discussion_points?: string[];
  caveats?: string[];
  prep_minutes?: number;
};

export type AgentResponse = {
  stream?: "news" | "community";
  cancelled?: boolean;
  keyword?: string;
  fetched?: number;
  negative_stats?: { suppressed: number; demoted: number };
  errors?: string[];
  ok: boolean;
  op: string;
  error?: string;
  candidates?: Candidate[];
  sources?: Source[];
  provider?: { name: string; installed: boolean; authenticated?: boolean | null; version?: string; auth_hint?: string };
  message?: string;
};


export type PersonalizationProfile = {
  keywords: string[];
  categories: string[];
  labels: string[];
};

/** How a story landed on air: recorded per broadcast date after the stream. */
export type Reaction = "hot" | "flat" | "skipped";

export type ArticleRecord = {
  id: string;
  candidate: Candidate;
  interested: boolean;
  labels: string[];
  note: string;
  broadcastDates: string[];
  savedAt: string;
  updatedAt: string;
  /** Keyed by broadcast date (YYYY-MM-DD). */
  reactions?: Record<string, Reaction>;
};
