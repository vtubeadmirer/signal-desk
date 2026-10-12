import type { NegativeRule } from "./negativePreferences";
import { Command } from "@tauri-apps/plugin-shell";
import type { AgentResponse, Source, Candidate, PersonalizationProfile } from "./types";

type Child = Awaited<ReturnType<Command<string>["spawn"]>>;
let starting: Promise<Child> | null = null;
let nextId = 0;
let activeCollect: string | null = null;
const pending = new Map<string, { resolve: (value: AgentResponse) => void; reject: (reason: unknown) => void; timer: ReturnType<typeof setTimeout> }>();

function rejectAll(error: unknown) {
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  pending.clear();
}

function startAgent(): Promise<Child> {
  if (starting) return starting;
  const command = Command.sidecar("binaries/signal-desk-agent");
  // The shell plugin emits one data event per stdout line, without its newline.
  command.stdout.on("data", (line) => {
    try {
      const response = JSON.parse(String(line)) as AgentResponse & { request_id?: string };
      if (!response.request_id) return;
      const waiter = pending.get(response.request_id);
      if (!waiter) return;
      pending.delete(response.request_id);
      clearTimeout(waiter.timer);
      waiter.resolve(response);
    } catch {
      rejectAll(new Error("Agent returned invalid JSON"));
    }
  });
  command.stderr.on("data", (line) => console.error("[signal-desk-agent]", String(line)));
  command.on("error", (error) => rejectAll(new Error(String(error))));
  command.on("close", () => {
    starting = null;
    rejectAll(new Error("뉴스 처리 프로세스가 종료되었습니다. 다시 시도해 주세요."));
  });
  starting = command.spawn().catch((error) => {
    starting = null;
    throw error;
  });
  return starting;
}

export async function callAgent(payload: Record<string, unknown>): Promise<AgentResponse> {
  const child = await startAgent();
  const requestId = typeof payload.request_id === "string" ? payload.request_id : String(++nextId);
  return new Promise<AgentResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("처리 시간이 초과되었습니다. 다시 시도해 주세요."));
    }, payload.op === "collect" ? 900_000 : 180_000);
    pending.set(requestId, { resolve, reject, timer });
    void child.write(`${JSON.stringify({ ...payload, request_id: requestId })}\n`).catch((error) => {
      const waiter = pending.get(requestId);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      pending.delete(requestId);
      waiter.reject(error);
    });
  });
}

export async function health() {
  return callAgent({ op: "health" });
}

export async function collect(
  sources: Source[],
  personalization: PersonalizationProfile = { keywords: [], categories: [], labels: [] },
  stream: "news" | "community" = "news",
  excludedHashes: string[] = [],
  negativeRules: NegativeRule[] = [],
) {
  const requestId = String(++nextId);
  activeCollect = requestId;
  try {
    return await callAgent({ op: "collect", sources, personalization, stream, excluded_hashes: excludedHashes, negative_rules: negativeRules, request_id: requestId });
  } finally {
    if (activeCollect === requestId) activeCollect = null;
  }
}

/** Ask the sidecar to finish the running collection with whatever it has fetched so far. */
export async function cancelCollection(): Promise<boolean> {
  const target = activeCollect;
  if (!target) return false;
  const r = await callAgent({ op: "cancel", target });
  return Boolean(r.ok && (r as { cancelled?: boolean }).cancelled);
}

export async function analyze(candidates: Candidate[], provider: string) {
  return callAgent({ op: "analyze", candidates, provider });
}
