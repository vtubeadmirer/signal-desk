export type Source = {
  name: string;
  url: string;
  tier: "official" | "professional" | "approved_feed";
  category: string;
  enabled: boolean;
};

export type Candidate = {
  priority: number;
  slide_order: number;
  category: string;
  event_id: string;
  decision: "candidate" | "manual_review" | "exclude";
  content_type: "news" | "official" | "community" | "trend" | "meme" | "rumor";
  source_type: "media" | "official" | "community";
  collection_method: "rss" | "api" | "approved_feed" | "manual";
  usage_status: "official_feed" | "review_required" | "permission_required" | "blocked";
  score: number;
  score_raw: number;
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
  why_now?: string;
  confirmed_facts?: string[];
  discussion_points?: string[];
  caveats?: string[];
  prep_minutes?: number;
};

export type AgentResponse = {
  ok: boolean;
  op: string;
  error?: string;
  candidates?: Candidate[];
  sources?: Source[];
  provider?: { name: string; installed: boolean; authenticated?: boolean; version?: string; auth_hint?: string };
  message?: string;
};
