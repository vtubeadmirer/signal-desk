import { Command } from "@tauri-apps/plugin-shell";
import type { AgentResponse, Source, Candidate } from "./types";

let command: Command<string> | null = null;
let child: Awaited<ReturnType<Command<string>["spawn"]>> | null = null;
let buffer = "";
let pending: Array<{ resolve: (value: AgentResponse) => void; reject: (reason: unknown) => void }> = [];

function startAgent() {
  if (command) return command;
  command = Command.sidecar("binaries/signal-desk-agent");
  command.stdout.on("data", (line) => {
    buffer += String(line);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      if (!raw.trim()) continue;
      try {
        const parsed = JSON.parse(raw) as AgentResponse;
        const waiter = pending.shift();
        waiter?.resolve(parsed);
      } catch (error) {
        const waiter = pending.shift();
        waiter?.reject(error);
      }
    }
  });
  command.stderr.on("data", (line) => {
    console.error("[signal-desk-agent stderr]", String(line));
  });
  command.on("error", (error) => {
    console.error("[signal-desk-agent error]", error);
  });
  command.on("close", (event) => {
    console.error("[signal-desk-agent close]", event);
    command = null;
    child = null;
    const old = pending;
    pending = [];
    for (const item of old) {
      item.reject(
        new Error(
          `Signal Desk agent closed (code=${event.code}, signal=${event.signal})`,
        ),
      );
    }
  });
  return command;
}

export async function callAgent(payload: Record<string, unknown>): Promise<AgentResponse> {
  const cmd = startAgent();
  const promise = new Promise<AgentResponse>((resolve, reject) => pending.push({ resolve, reject }));
  if (!child) {
    try {
      child = await cmd.spawn();
      console.error("[signal-desk-agent spawned]", child.pid);
    } catch (error) {
      console.error("[signal-desk-agent spawn error]", error);
      pending.pop()?.reject(error);
      throw error;
    }
  }
  await child.write(`${JSON.stringify(payload)}\n`);
  return promise;
}

export async function health() {
  return callAgent({ op: "health" });
}

export async function collect(sources: Source[]) {
  return callAgent({ op: "collect", sources });
}

export async function analyze(candidates: Candidate[], provider: string) {
  return callAgent({ op: "analyze", candidates, provider });
}
