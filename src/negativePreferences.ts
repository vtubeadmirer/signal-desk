import dictionary from "../shared/negative_topics.json";
import { candidateStream, type SignalStream } from "./streams";
import type { RejectedItem, LearningSettings } from "./rejections";
import type { Candidate } from "./types";

export type NegativeRule = {
  id: string;
  stream: SignalStream;
  kind: "topic" | "pair" | "keyword";
  terms: string[];
  label: string;
  count: number;
  weight: number;
  lastRejectedAt: string;
};

const stopwords = new Set(dictionary.stopwords);
const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

export function preferenceTokens(title: string): string[] {
  const result = new Set<string>();
  for (const raw of normalize(title).match(/[0-9a-z가-힣]{2,}/g) ?? []) {
    let word = raw;
    if (stopwords.has(word)) continue;
    for (let round = 0; round < 2; round++) {
      const suffix = dictionary.suffixes.find((ending) => word.endsWith(ending) && word.length - ending.length >= 2);
      if (!suffix) break;
      word = word.slice(0, -suffix.length);
    }
    if (word.length >= 2 && word.length <= 32 && !/^\d+$/.test(word) && !stopwords.has(word) && !/^(.)\1+$/.test(word)) result.add(word);
  }
  return [...result].slice(0, 6);
}

function topicMatches(title: string, id: string): boolean {
  const topic = dictionary.topics.find((value) => value.id === id);
  const text = normalize(title);
  return !!topic && topic.groups.every((group) => group.some((term) => text.includes(term)));
}

export function learnNegativeRules(items: RejectedItem[], mode: LearningSettings["mode"]): NegativeRule[] {
  const rules = new Map<string, NegativeRule>();
  function record(item: RejectedItem, kind: NegativeRule["kind"], terms: string[], label: string) {
    const id = `${item.stream}:${kind}:${terms.join("|")}`;
    const old = rules.get(id);
    const count = (old?.count ?? 0) + 1;
    rules.set(id, { id, stream: item.stream, kind, terms, label, count, weight: Math.min(80, 40 + (count - 1) * 10), lastRejectedAt: old && old.lastRejectedAt > item.rejectedAt ? old.lastRejectedAt : item.rejectedAt });
  }
  for (const item of items) {
    for (const topic of dictionary.topics) if (topicMatches(item.title, topic.id)) record(item, "topic", [topic.id], topic.label);
    const words = preferenceTokens(item.title);
    for (let first = 0; first < words.length; first++) {
      for (let second = first + 1; second < words.length; second++) {
        const pair = [words[first], words[second]].sort();
        record(item, "pair", pair, pair.join(" + "));
      }
    }
    if (mode === "strict") for (const word of words) if (word.length >= 3) record(item, "keyword", [word], word);
  }
  const sorted = [...rules.values()].sort((a, b) => b.count - a.count || b.lastRejectedAt.localeCompare(a.lastRejectedAt) || a.id.localeCompare(b.id));
  return [...sorted.filter((rule) => rule.stream === "news").slice(0, 300), ...sorted.filter((rule) => rule.stream === "community").slice(0, 300)];
}

export function activeNegativeRules(rules: NegativeRule[], settings: LearningSettings): NegativeRule[] {
  return settings.enabled ? rules.filter((rule) => !settings.mutedRuleIds.includes(rule.id)) : [];
}

export function negativePenalty(item: Candidate, rules: NegativeRule[]) {
  if (item.domestic_emergency) return { penalty: 0, matches: [] as string[] };
  const words = new Set(preferenceTokens(item.title));
  const stream = candidateStream(item);
  let penalty = 0;
  const matches: string[] = [];
  for (const rule of rules) {
    if (rule.stream !== stream) continue;
    const hits = rule.kind === "topic" ? (topicMatches(item.title, rule.terms[0]) ? 1 : 0) : rule.terms.filter((term) => words.has(term)).length;
    const full = hits === rule.terms.length;
    const amount = full ? rule.weight : hits > 0 ? Math.min(35, Math.round(rule.weight * 0.35)) : 0;
    if (amount) { penalty = Math.max(penalty, amount); matches.push(rule.label); }
  }
  return { penalty, matches: [...new Set(matches)].slice(0, 3) };
}

export function applyNegativeRules(items: Candidate[], rules: NegativeRule[]): Candidate[] {
  return items.map((item) => {
    const { penalty, matches } = negativePenalty(item, rules);
    const base = item.score_before_negative ?? (item.score + (item.negative_penalty ?? 0));
    return { ...item, score_before_negative: base, negative_penalty: penalty, negative_matches: matches, score: Math.max(0, base - penalty) };
  }).filter((item) => item.negative_penalty < 40);
}
