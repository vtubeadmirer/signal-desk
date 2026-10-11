import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { learnNegativeRules, activeNegativeRules, applyNegativeRules, negativePenalty, preferenceTokens, type NegativeRule } from "./negativePreferences";
import { DEFAULT_LEARNING, learningValid, type LearningSettings, addRejections, exclusionHashes, isRejected, rejectionId, rejectionIndex, rejectionValid, normalizedTitle, MAX_REJECTIONS, type RejectedItem } from "./rejections";
import { candidateStream, sourceStream, streamCandidates, replaceStream, type SignalStream, type SavedStream } from "./streams";
import { parseBackup, serializeBackup, writeStorageAtomically, sourceValid, type DeskBackup } from "./backup";
import { readBackupFile, saveBackupFile } from "./backupFiles";
import { analyze, collect, health } from "./agent";
import type { ArticleRecord, Candidate, PersonalizationProfile, Source } from "./types";

const STORAGE_KEY = "signal-desk:sources:v1";
const PROVIDER_KEY = "signal-desk:provider:v1";
const ARTICLES_KEY = "signal-desk:articles:v1";
const LEARNING_KEY = "signal-desk:rejection-learning:v1";
const REJECTIONS_KEY = "signal-desk:rejections:v1";
const DATE_KEY = "signal-desk:broadcast-date:v1";
const COMMUNITY_MIGRATION_KEY = "signal-desk:community-sources:v1";

function articleId(url: string): string {
  return url.trim().split("#", 1)[0].replace(/\/+$/, "");
}

function loadLearning(): LearningSettings {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LEARNING_KEY) ?? "null");
    return learningValid(data) ? data : DEFAULT_LEARNING;
  } catch { return DEFAULT_LEARNING; }
}

function loadRejections(): RejectedItem[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(REJECTIONS_KEY) ?? "[]");
    return Array.isArray(data) && data.length <= MAX_REJECTIONS && data.every(rejectionValid) ? data : [];
  } catch { return []; }
}

function localDateKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSavedArticle(record: ArticleRecord): boolean {
  return Boolean(
    record.interested ||
    record.labels.length ||
    record.note.trim() ||
    record.broadcastDates.length
  );
}

function loadSavedArticles(): ArticleRecord[] {
  try {
    const raw = localStorage.getItem(ARTICLES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ArticleRecord =>
      Boolean(
        item &&
        typeof item.id === "string" &&
        item.candidate &&
        typeof item.candidate.url === "string" &&
        typeof item.interested === "boolean" &&
        Array.isArray(item.labels) &&
        Array.isArray(item.broadcastDates) &&
        typeof item.note === "string"
      )
    );
  } catch {
    return [];
  }
}

const COMMUNITY_SOURCES: Source[] = [
  { name: "디시 버츄얼 스트리머 개념글", url: "https://gall.dcinside.com/mini/board/lists/?id=virtual_streamer&exception_mode=recommend", kind: "community", tier: "approved_feed", category: "버튜버·크리에이터", enabled: true },
  { name: "디시 치지직 개념글", url: "https://gall.dcinside.com/mgallery/board/lists/?id=chzzk&exception_mode=recommend", kind: "community", tier: "approved_feed", category: "IT·플랫폼", enabled: true },
  { name: "디시 중세게임 개념글", url: "https://gall.dcinside.com/mgallery/board/lists/?id=aoegame&exception_mode=recommend", kind: "community", tier: "approved_feed", category: "게임·인터넷 방송", enabled: true },
  { name: "루리웹 유머 베스트", url: "https://bbs.ruliweb.com/best/humor", kind: "community", tier: "approved_feed", category: "커뮤니티·밈", enabled: true },
  { name: "펨코 포텐 화제순", url: "https://www.fmkorea.com/best2", kind: "community", tier: "approved_feed", category: "커뮤니티·밈", enabled: true },
];

const DEFAULT_SOURCES: Source[] = [
  ...COMMUNITY_SOURCES,
  {
    name: "전자신문 IT",
    url: "https://rss.etnews.com/03.xml",
    tier: "professional",
    category: "IT·플랫폼",
    enabled: true,
  },
  {
    name: "연합뉴스",
    url: "https://www.yna.co.kr/rss/news.xml",
    tier: "professional",
    category: "사회·생활",
    enabled: true,
  },
  {
    name: "경향신문",
    url: "https://www.khan.co.kr/rss/rssdata/total_news.xml",
    tier: "professional",
    category: "사회·생활",
    enabled: true,
  },
  {
    name: "동아일보",
    url: "https://rss.donga.com/total.xml",
    tier: "professional",
    category: "사회·생활",
    enabled: true,
  },
  {
    name: "한겨레",
    url: "https://www.hani.co.kr/rss",
    tier: "professional",
    category: "사회·생활",
    enabled: true,
  },
  {
    name: "IT동아",
    url: "https://it.donga.com/feeds/rss/",
    tier: "professional",
    category: "IT·플랫폼",
    enabled: true,
  },
  {
    name: "테크M",
    url: "https://www.techm.kr/rss/allArticle.xml",
    tier: "professional",
    category: "IT·플랫폼",
    enabled: true,
  },
  {
    name: "JTBC",
    url: "https://fs.jtbc.co.kr/RSS/newsflash.xml",
    tier: "professional",
    category: "사회·생활",
    enabled: true,
  },
  {
    name: "SBS",
    url: "https://news.sbs.co.kr/news/SectionRssFeed.do?section=01",
    tier: "professional",
    category: "사회·생활",
    enabled: true,
  },
];

const CATEGORIES = ["전체", "사회·생활", "버튜버·크리에이터", "IT·플랫폼", "시청자 권리·안전", "게임·인터넷 방송", "커뮤니티·밈"];

function loadSources(): Source[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : DEFAULT_SOURCES;
    return Array.isArray(parsed) && parsed.length <= 50 && parsed.every(sourceValid) ? parsed : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}

function summaryPreview(value?: string | null): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "요약이 제공되지 않은 기사입니다. 원문 링크에서 내용을 확인해 주세요.";
  }
  const limit = 320;
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export default function App() {
  const [tab, setTab] = useState<"today" | "community" | "prep" | "archive" | "settings">("today");
  const [settingsSection, setSettingsSection] = useState<"sources" | "rules" | "security" | "backup" | "excluded">("sources");
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [provider, setProvider] = useState(localStorage.getItem(PROVIDER_KEY) ?? "codex");
  const [status, setStatus] = useState("준비됨");
  const [providerStatus, setProviderStatus] = useState<{ installed: boolean; authenticated?: boolean; version?: string; auth_hint?: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [savedArticles, setSavedArticles] = useState<ArticleRecord[]>(loadSavedArticles);
  const [rejectedItems, setRejectedItems] = useState<RejectedItem[]>(loadRejections);
  const rejectedIndex = useMemo(() => rejectionIndex(rejectedItems), [rejectedItems]);
  const [learning, setLearning] = useState<LearningSettings>(loadLearning);
  const [learningQuery, setLearningQuery] = useState("");
  const [learningStream, setLearningStream] = useState<SavedStream>("all");
  const learnedRules = useMemo(() => learnNegativeRules(rejectedItems, learning.mode), [rejectedItems, learning.mode]);
  const activeRules = useMemo(() => activeNegativeRules(learnedRules, learning), [learnedRules, learning]);
  const learnedCandidates = useMemo(() => applyNegativeRules(candidates, activeRules), [candidates, activeRules]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [excludedQuery, setExcludedQuery] = useState("");
  const [selectedBroadcastDate, setSelectedBroadcastDate] = useState(() => localStorage.getItem(DATE_KEY) || localDateKey());
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [archiveQuery, setArchiveQuery] = useState("");
  const stream: SignalStream = tab === "community" ? "community" : "news";
  const streamLabel = stream === "news" ? "일반 뉴스" : "커뮤니티·밈";
  const activeSources = sources.filter((source) => source.enabled && sourceStream(source) === stream);
  const [filters, setFilters] = useState<Record<SignalStream, string>>({ news: "전체", community: "전체" });
  const filter = filters[stream];
  function setFilter(value: string) { setFilters((current) => ({ ...current, [stream]: value })); }
  const [expanded, setExpanded] = useState<Record<SignalStream, boolean>>({ news: false, community: false });
  const showMoreCandidates = expanded[stream];
  function setShowMoreCandidates(value: boolean) { setExpanded((current) => ({ ...current, [stream]: value })); }
  const [savedStream, setSavedStream] = useState<SavedStream>("all");
  const [running, setRunning] = useState(false);
  const [lastRuns, setLastRuns] = useState<Record<SignalStream, string>>({ news: "", community: "" });
  const lastRun = lastRuns[stream];
  function setLastRun(value: string) { setLastRuns((current) => ({ ...current, [stream]: value })); }
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [pendingBackup, setPendingBackup] = useState<DeskBackup | null>(null);

  useEffect(() => {
    if (!localStorage.getItem(COMMUNITY_MIGRATION_KEY)) {
      setSources((current) => [...current, ...COMMUNITY_SOURCES.filter((preset) => !current.some((source) => source.url === preset.url))].slice(0, 50));
      localStorage.setItem(COMMUNITY_MIGRATION_KEY, "1");
    }
  }, []);

  useEffect(() => { localStorage.setItem(DATE_KEY, selectedBroadcastDate); }, [selectedBroadcastDate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    localStorage.setItem(PROVIDER_KEY, provider);
  }, [provider]);

  useEffect(() => {
    try { localStorage.setItem(ARTICLES_KEY, JSON.stringify(savedArticles)); }
    catch { setStatus("보관함을 저장하지 못했습니다. 저장 공간을 확인하고 백업 내보내기로 내용을 보존하세요."); }
  }, [savedArticles]);

  async function refreshHealth() {
    try {
      const r = await health();
      setProviderStatus(r.provider ?? null);
    } catch {
      setProviderStatus(null);
    }
  }

  useEffect(() => {
    void refreshHealth();
    void checkForUpdate();
  }, []);

  async function checkForUpdate() {
    try {
      const update = await check();
      setAvailableUpdate(update);
    } catch {
      // Updater errors are deliberately not exposed with low-level details.
    }
  }

  async function installUpdate() {
    if (!availableUpdate) return;
    setUpdateBusy(true);
    try {
      await availableUpdate.downloadAndInstall();
    } catch {
      setUpdateBusy(false);
    }
  }

  const filtered = useMemo(() => {
    return streamCandidates(learnedCandidates.filter((item) => !isRejected(item, rejectedIndex)), stream, filter);
  }, [learnedCandidates, stream, filter, rejectedIndex]);

  const visibleCandidates = showMoreCandidates ? filtered : filtered.slice(0, 10);
  const checkedCandidates = learnedCandidates.filter((item) => candidateStream(item) === stream && !isRejected(item, rejectedIndex) && checkedIds.includes(rejectionId(item.url)));
  const allVisibleChecked = visibleCandidates.length > 0 && visibleCandidates.every((item) => checkedIds.includes(rejectionId(item.url)));

  function toggleChecked(id: string) {
    setCheckedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleVisibleChecked() {
    const ids = visibleCandidates.map((item) => rejectionId(item.url));
    setCheckedIds((current) => allVisibleChecked ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  function persistLearning(settings: LearningSettings) {
    try {
      localStorage.setItem(LEARNING_KEY, JSON.stringify(settings));
      setLearning(settings);
      setCheckedIds([]);
      setStatus("제외 성향 설정을 저장했습니다. 다음 수집부터 해당 성향으로 후보를 선별합니다.");
    } catch { setStatus("제외 성향 설정을 저장하지 못했습니다. 기존 설정을 유지합니다."); }
  }

  function toggleRule(rule: NegativeRule) {
    const muted = learning.mutedRuleIds.includes(rule.id);
    const next = muted ? learning.mutedRuleIds.filter((id) => id !== rule.id) : [...learning.mutedRuleIds, rule.id];
    if (next.length > 1000) { setStatus("비활성 규칙은 최대 1,000개입니다."); return; }
    persistLearning({ ...learning, mutedRuleIds: next });
  }

  function persistRejections(items: RejectedItem[]) {
    localStorage.setItem(REJECTIONS_KEY, JSON.stringify(items));
    setRejectedItems(items);
  }

  function rejectCandidates(items: Candidate[]) {
    if (!items.length) return;
    try {
      const next = addRejections(rejectedItems, items.map((item) => ({ id: rejectionId(item.url), url: item.url, title: item.title, source_name: item.source_name, stream: candidateStream(item), rejectedAt: new Date().toISOString() })));
      persistRejections(next);
      const index = rejectionIndex(next);
      const nextRules = activeNegativeRules(learnNegativeRules(next, learning.mode), learning);
      const remainingIds = new Set(applyNegativeRules(candidates, nextRules).filter((item) => !isRejected(item, index)).map((item) => rejectionId(item.url)));
      setCheckedIds((current) => current.filter((id) => remainingIds.has(id)));
      setStatus(`${items.length}개를 후보에서 제외했습니다. 같은 글은 다시 추천하지 않고, 비슷한 새 글에는 제외 성향을 반영합니다.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "제외 목록을 저장하지 못했습니다."); }
  }

  function allowRejected(item: RejectedItem) {
    try {
      const title = normalizedTitle(item.title);
      persistRejections(rejectedItems.filter((record) => record.id !== item.id && !([...title].length >= 8 && normalizedTitle(record.title) === title)));
      setStatus("제외를 해제했습니다. 현재 후보에 남아 있으면 바로 표시되고, 그 외에는 다음 수집부터 다시 후보가 될 수 있습니다.");
    } catch { setStatus("제외 목록을 저장하지 못했습니다. 기존 제외 상태는 유지됩니다."); }
  }

  const personalization = useMemo<PersonalizationProfile>(() => {
    const chosen = savedArticles.filter((record) => candidateStream(record.candidate) === stream && !isRejected(record.candidate, rejectedIndex) && negativePenalty(record.candidate, activeRules).penalty < 40).filter((record) =>
      record.interested || record.broadcastDates.length > 0 || record.labels.length > 0
    );
    const keywords = new Set<string>();
    const categories = new Set<string>();
    const labels = new Set<string>();

    for (const record of chosen) {
      categories.add(record.candidate.category);
      for (const keyword of record.candidate.keywords ?? []) {
        if (keyword.trim()) keywords.add(keyword.trim());
      }
      for (const label of record.labels) {
        if (!label.trim()) continue;
        labels.add(label.trim());
        label.split(/[·,\/\s]+/).filter((word) => word.length >= 2).forEach((word) => keywords.add(word));
      }
    }

    return {
      keywords: Array.from(keywords).slice(0, 250),
      categories: Array.from(categories).slice(0, 30),
      labels: Array.from(labels).slice(0, 50),
    };
  }, [savedArticles, stream, rejectedIndex, activeRules]);

  const archiveRecords = useMemo(() => {
    const query = archiveQuery.trim().toLocaleLowerCase();
    return savedArticles
      .filter(isSavedArticle)
      .filter((record) => savedStream === "all" || candidateStream(record.candidate) === savedStream)
      .filter((record) => {
        if (!query) return true;
        const text = [
          record.candidate.title,
          record.candidate.summary,
          record.candidate.category,
          record.candidate.source_name,
          ...record.labels,
          record.note,
        ].join(" ").toLocaleLowerCase();
        return text.includes(query);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [savedArticles, archiveQuery, savedStream]);

  function updateArticleRecord(
    item: Candidate,
    change: (record: ArticleRecord) => ArticleRecord,
  ) {
    const id = articleId(item.url);
    if (!id) return;
    const now = new Date().toISOString();

    setSavedArticles((current) => {
      const existing = current.find((record) => record.id === id);
      const base: ArticleRecord = existing ?? {
        id,
        candidate: item,
        interested: false,
        labels: [],
        note: "",
        broadcastDates: [],
        savedAt: now,
        updatedAt: now,
      };
      const updated = { ...change(base), candidate: item, updatedAt: now };
      const remaining = current.filter((record) => record.id !== id);
      return isSavedArticle(updated) ? [...remaining, updated] : remaining;
    });
  }

  function updateRecord(
    id: string,
    change: (record: ArticleRecord) => ArticleRecord,
  ) {
    const now = new Date().toISOString();
    setSavedArticles((current) =>
      current
        .map((record) => record.id === id ? { ...change(record), updatedAt: now } : record)
        .filter(isSavedArticle)
    );
  }

  function removeRecord(id: string) {
    setSavedArticles((current) => current.filter((record) => record.id !== id));
  }

  function toggleInterest(item: Candidate) {
    updateArticleRecord(item, (record) => ({
      ...record,
      interested: !record.interested,
    }));
  }

  function toggleBroadcastDate(item: Candidate) {
    updateArticleRecord(item, (record) => {
      const alreadyAdded = record.broadcastDates.includes(selectedBroadcastDate);
      return {
        ...record,
        broadcastDates: alreadyAdded
          ? record.broadcastDates.filter((date) => date !== selectedBroadcastDate)
          : [...record.broadcastDates, selectedBroadcastDate].sort(),
      };
    });
  }

  function addLabel(item: Candidate) {
    const id = articleId(item.url);
    const label = (labelDrafts[id] ?? "").trim().slice(0, 40);
    if (!label) return;

    updateArticleRecord(item, (record) => ({
      ...record,
      labels: record.labels.some((value) => value.toLocaleLowerCase() === label.toLocaleLowerCase())
        ? record.labels
        : [...record.labels, label].slice(0, 20),
    }));
    setLabelDrafts((current) => ({ ...current, [id]: "" }));
  }

  function removeLabel(id: string, label: string) {
    updateRecord(id, (record) => ({
      ...record,
      labels: record.labels.filter((value) => value !== label),
    }));
  }

  async function runCollection() {
    setRunning(true);
    setStatus(`${streamLabel} 수집 및 후보 선별 중…`);
    try {
      const r = await collect(activeSources, personalization, stream, await exclusionHashes(rejectedItems), activeRules.filter((rule) => rule.stream === stream));
      if (!r.ok) throw new Error(r.error ?? "수집 실패");
      const freshCandidates = r.candidates ?? [];
      setCandidates((current) => replaceStream(current, freshCandidates, stream));
      const previousIds = candidates.filter((item) => candidateStream(item) === stream).map((item) => rejectionId(item.url));
      setCheckedIds((current) => current.filter((id) => !previousIds.includes(id)));
      setSavedArticles((current) => {
        const freshById = new Map(freshCandidates.map((item) => [articleId(item.url), item]));
        return current.map((record) => {
          const fresh = freshById.get(record.id);
          return fresh
            ? { ...record, candidate: fresh, updatedAt: new Date().toISOString() }
            : record;
        });
      });
      setShowMoreCandidates(false);
      setLastRun(new Date().toLocaleString("ko-KR"));
      setStatus(`${streamLabel} 후보 ${r.candidates?.length ?? 0}개를 만들었습니다.${r.negative_stats ? ` 제외 성향으로 ${r.negative_stats.suppressed}건 제외 · ${r.negative_stats.demoted}건 감점.` : ""}${r.errors?.length ? ` 수집 실패: ${r.errors.join(" / ")}` : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "수집 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
      await refreshHealth();
    }
  }

  async function runAiAnalysis() {
    if (!filtered.length) return;
    setRunning(true);
    setStatus(`${streamLabel} 상위 후보만 AI 분석 중…`);
    try {
      const r = await analyze(filtered.slice(0, 15), provider);
      if (!r.ok) throw new Error(r.error ?? "AI 분석 실패");
      const analyzedById = new Map((r.candidates ?? []).map((item) => [item.event_id, item]));
      setCandidates((current) => current.map((item) => ({
        ...item,
        ...(analyzedById.get(item.event_id) ?? {}),
      })));
      const analyzedByUrl = new Map((r.candidates ?? []).map((item) => [articleId(item.url), item]));
      setSavedArticles((current) => current.map((record) => {
        const analyzed = analyzedByUrl.get(record.id);
        return analyzed ? { ...record, candidate: analyzed, updatedAt: new Date().toISOString() } : record;
      }));
      setStatus("AI 분석 완료");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
      await refreshHealth();
    }
  }

  function addSource() {
    setSources((current) => [
      ...current,
      {
        name: `새 피드 ${current.length + 1}`,
        url: "https://",
        tier: "approved_feed",
        category: "사회·생활",
        enabled: false,
      },
    ]);
  }

  function backupData() {
    return { articles: savedArticles, sources, provider: "codex" as const, selectedBroadcastDate, rejectedItems, rejectionLearning: learning };
  }

  async function exportBackup() {
    setBackupBusy(true);
    try {
      const saved = await saveBackupFile(serializeBackup(backupData()));
      setBackupStatus(saved ? "백업을 저장했습니다. 다른 PC의 Signal Desk에서 이 파일을 불러오세요." : "내보내기를 취소했습니다.");
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : "백업 저장에 실패했습니다."); }
    finally { setBackupBusy(false); }
  }

  async function importBackup() {
    setBackupBusy(true);
    try {
      const raw = await readBackupFile();
      if (raw === null) { setBackupStatus("불러오기를 취소했습니다."); return; }
      setPendingBackup(parseBackup(raw));
      setBackupStatus("백업 내용을 확인한 뒤 복원하세요. 현재 보관함과 설정이 백업 내용으로 교체됩니다.");
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : "백업을 읽지 못했습니다."); }
    finally { setBackupBusy(false); }
  }

  function restoreBackup() {
    if (!pendingBackup) return;
    try {
      writeStorageAtomically(localStorage, {
        [ARTICLES_KEY]: JSON.stringify(pendingBackup.articles),
        [STORAGE_KEY]: JSON.stringify(pendingBackup.sources),
        [PROVIDER_KEY]: pendingBackup.provider,
        [DATE_KEY]: pendingBackup.selectedBroadcastDate,
        [REJECTIONS_KEY]: JSON.stringify(pendingBackup.rejectedItems ?? []),
        [LEARNING_KEY]: JSON.stringify(pendingBackup.rejectionLearning ?? DEFAULT_LEARNING),
        [COMMUNITY_MIGRATION_KEY]: "1",
      });
      setSavedArticles(pendingBackup.articles);
      setRejectedItems(pendingBackup.rejectedItems ?? []);
      setLearning(pendingBackup.rejectionLearning ?? DEFAULT_LEARNING);
      setCheckedIds([]);
      setSources(pendingBackup.sources);
      setProvider(pendingBackup.provider);
      setSelectedBroadcastDate(pendingBackup.selectedBroadcastDate);
      setCandidates([]);
      setLastRuns({ news: "", community: "" });
      setFilters({ news: "전체", community: "전체" });
      setExpanded({ news: false, community: false });
      setSavedStream("all");
      setArchiveQuery("");
      setFilter("전체");
      setPendingBackup(null);
      setBackupStatus("보관함·방송 준비·소스 설정을 복원했습니다. AI 로그인은 이 PC에서 연결하세요.");
    } catch { setBackupStatus("저장 공간이 부족하거나 저장소에 접근할 수 없어 복원하지 못했습니다. 기존 데이터는 유지됩니다."); }
  }

  function restoreDefaultSources() {
    setSources(DEFAULT_SOURCES.map((source) => ({ ...source })));
  }

  function updateSource(index: number, patch: Partial<Source>) {
    setSources((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function deleteSource(index: number) {
    setSources((current) => current.filter((_, i) => i !== index));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">SIGNAL DESK <small>v0.3.0</small></div>
          <div className="subtitle">오늘 방송에서 이야기할 만한 신호만 압축합니다.</div>
        </div>
        <div className="top-actions">
          <span className={`status-dot ${providerStatus?.authenticated ? "ok" : "warn"}`} />
          <span>{providerStatus?.authenticated ? `Codex ${providerStatus.version ?? "인증됨"}` : providerStatus?.installed ? "Codex 로그인 필요" : "AI 연결 필요"}</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>일반 뉴스</button>
        <button className={tab === "community" ? "active" : ""} onClick={() => setTab("community")}>커뮤니티·밈</button>
        <button className={tab === "prep" ? "active" : ""} onClick={() => setTab("prep")}>방송 준비</button>
        <button className={tab === "archive" ? "active" : ""} onClick={() => setTab("archive")}>보관함</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>환경설정</button>
      </nav>

      {(tab === "today" || tab === "community") && (
        <main className="content">
          <section className="hero-card">
            <div>
              <span className="eyebrow">{stream === "news" ? "TODAY’S NEWS" : "COMMUNITY & MEMES"}</span>
              <h1>{stream === "news" ? "오늘의 일반 뉴스" : "커뮤니티 소식과 밈"}</h1>
              <p>{stream === "news" ? "언론·공식 소스에서 방송 후보를 최대 20개 선별합니다." : "커뮤니티 인기글에서 화제를 찾습니다. 제목과 인기 지표만 수집하므로 원문에서 맥락을 확인하세요."}</p>
            </div>
            <div className="hero-actions">
              <button className="secondary" onClick={() => { setTab("settings"); setSettingsSection("backup"); }}>백업·복원</button>
              <button className="primary" disabled={running || activeSources.length === 0} onClick={runCollection}>
                {running ? "처리 중…" : stream === "news" ? "뉴스 가져오기" : "커뮤니티 소식 가져오기"}
              </button>
              <button className="secondary" disabled={running || !filtered.length || !providerStatus?.authenticated} onClick={runAiAnalysis}>
                AI 분석
              </button>
            </div>
          </section>

          <section className="broadcast-target">
            <div>
              <strong>방송 예정일</strong>
              <span>기사의 「방송 준비에 담기」를 누르면 이 날짜에 저장됩니다.</span>
            </div>
            <input
              className="date-input"
              type="date"
              aria-label="방송 예정일"
              value={selectedBroadcastDate}
              onChange={(event) => setSelectedBroadcastDate(event.target.value)}
            />
            <button className="secondary" onClick={() => setTab("prep")}>방송 준비 열기</button>
          </section>

          <section className="control-row">
            <div className="filters">
              {CATEGORIES.filter((category) => stream === "community" || category !== "커뮤니티·밈").map((category) => (
                <button key={category} className={filter === category ? "filter active" : "filter"} onClick={() => { setFilter(category); setShowMoreCandidates(false); }}>{category}</button>
              ))}
            </div>
            <div className="run-info">{lastRun ? `마지막 실행 ${lastRun}` : status}</div>
          </section>

          <section className="rejection-toolbar" aria-label="후보 제외">
            <label><input type="checkbox" checked={allVisibleChecked} disabled={running || visibleCandidates.length === 0} onChange={toggleVisibleChecked} /> 보이는 후보 모두 선택</label>
            <button className="danger" disabled={running || checkedCandidates.length === 0} onClick={() => rejectCandidates(checkedCandidates)}>선택 {checkedCandidates.length}개 제외</button>
            <button className="secondary" onClick={() => { setTab("settings"); setSettingsSection("excluded"); }}>제외 목록 ({rejectedItems.length})</button>
            <span>제외한 글은 다음 수집과 AI 분석에서도 빠집니다.</span>
          </section>
          <section className="signals-grid">
            {filtered.length === 0 ? (
              <div className="empty-card">
                <strong>{streamLabel} 후보가 없습니다.</strong>
                <span>{stream === "news" ? "RSS/Atom 소스를 활성화한 뒤 「뉴스 가져오기」를 누르세요." : "커뮤니티 소스를 활성화한 뒤 「커뮤니티 소식 가져오기」를 누르세요."}</span>
              </div>
            ) : visibleCandidates.map((item) => (
              <article className="signal-card" key={item.event_id}>
                <label className="candidate-checkbox"><input type="checkbox" aria-label={`${item.title} 제외 대상으로 선택`} checked={checkedIds.includes(rejectionId(item.url))} disabled={running} onChange={() => toggleChecked(rejectionId(item.url))} /> 제외할 후보 선택</label>
                <div className="signal-meta">
                  <span className="badge">{item.category}</span>
                  {item.source_type === "community" && <span className="badge">커뮤니티 화제 · 원문 확인 필요</span>}
                  <span className={`decision ${item.decision}`}>{item.decision === "candidate" ? "검토 후보" : item.decision === "manual_review" ? "추가 확인" : "제외"}</span>
                </div>
                <h2>{item.title}</h2>
                {item.engagement && <p className="community-metrics">목록 기준 추천 {item.engagement.recommendations} · 댓글 {item.engagement.comments}</p>}
                <p className="summary">
                  {summaryPreview(item.why_now?.trim() || item.summary?.trim())}
                </p>
                <details className="article-details">
                  <summary>수집한 내용 더 보기</summary>
                  <p>{item.summary?.trim() || "수집 소스가 별도의 본문이나 요약을 제공하지 않았습니다. 원문에서 확인해 주세요."}</p>
                </details>
                <div className="metrics">
                  <span>점수 {item.score}</span>
                  {item.negative_penalty ? <span title={item.negative_matches?.join(" / ")}>제외 성향 −{item.negative_penalty}</span> : null}
                  <span>대화성 {item.talkability}</span>
                  <span>검증비용 {item.verification_cost}</span>
                  <span>출처 {item.source_count}</span>
                  {item.personalization_bonus ? <span>관심 주제 +{item.personalization_bonus}</span> : null}
                </div>
                <div className="article-actions">
                  <button className="danger" disabled={running} onClick={() => rejectCandidates([item])}>이 글 제외</button>
                  <button
                    className={savedArticles.some((record) => record.id === articleId(item.url) && record.interested) ? "secondary selected" : "secondary"}
                    aria-pressed={savedArticles.some((record) => record.id === articleId(item.url) && record.interested)}
                    onClick={() => toggleInterest(item)}
                  >
                    {savedArticles.some((record) => record.id === articleId(item.url) && record.interested) ? "♥ 관심 저장됨" : "♡ 관심 뉴스"}
                  </button>
                  <button
                    className={savedArticles.some((record) => record.id === articleId(item.url) && record.broadcastDates.includes(selectedBroadcastDate)) ? "secondary selected" : "secondary"}
                    aria-pressed={savedArticles.some((record) => record.id === articleId(item.url) && record.broadcastDates.includes(selectedBroadcastDate))}
                    onClick={() => toggleBroadcastDate(item)}
                  >
                    {savedArticles.some((record) => record.id === articleId(item.url) && record.broadcastDates.includes(selectedBroadcastDate)) ? "방송 준비에서 빼기" : "＋ 방송 준비에 담기"}
                  </button>
                </div>
                {savedArticles.some((record) => record.id === articleId(item.url) && record.labels.length > 0) && (
                  <div className="personal-labels">
                    {savedArticles.find((record) => record.id === articleId(item.url))?.labels.map((label) => (
                      <button key={label} title="이 분류 삭제" onClick={() => removeLabel(articleId(item.url), label)}>
                        {label} ×
                      </button>
                    ))}
                  </div>
                )}
                <details className="personalize-details">
                  <summary>내 분류 추가</summary>
                  <div className="label-editor">
                    <input
                      value={labelDrafts[articleId(item.url)] ?? ""}
                      maxLength={40}
                      placeholder="예: AI 영상, 밈·커뮤니티"
                      aria-label="기사 개인 분류"
                      onChange={(event) => setLabelDrafts((current) => ({
                        ...current,
                        [articleId(item.url)]: event.target.value,
                      }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLabel(item);
                        }
                      }}
                    />
                    <button className="secondary" onClick={() => addLabel(item)}>분류 저장</button>
                  </div>
                </details>
                {item.discussion_points?.length ? (
                  <div className="discussion">
                    <div className="label">얘기할 포인트</div>
                    <ul>{item.discussion_points.slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul>
                  </div>
                ) : null}
                {item.confirmed_facts?.length ? <div className="discussion"><div className="label">제공된 자료에서 확인한 내용</div><ul>{item.confirmed_facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div> : null}
                {item.caveats?.length ? <div className="discussion"><div className="label">방송 전 확인할 주의사항</div><ul>{item.caveats.map((caveat, index) => <li key={index}>{caveat}</li>)}</ul></div> : null}
                <div className="card-footer">
                  <span>{item.source_name}</span>
                  <button className="link" onClick={() => void openUrl(item.url)}>원문 보기 ↗</button>
                </div>
              </article>
            ))}
          </section>
          {filtered.length > 10 && (
            <div className="candidate-expand">
              <button
                className="secondary"
                onClick={() => setShowMoreCandidates(!showMoreCandidates)}
              >
                {showMoreCandidates
                  ? "추가 후보 접기"
                  : `추가 후보 ${filtered.length - 10}개 펼쳐보기`}
              </button>
            </div>
          )}
        </main>
      )}

      {tab === "prep" && (
        <main className="content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">STREAM PLAN</span>
              <h1>방송 준비</h1>
              <p>방송 날짜별로 기사를 모으고 메모를 남기세요. 같은 기사를 여러 방송 날짜에 담을 수도 있습니다.</p>
            </div>
            <label className="date-control">
              방송 날짜
              <input
                className="date-input"
                type="date"
                value={selectedBroadcastDate}
                onChange={(event) => setSelectedBroadcastDate(event.target.value)}
              />
            </label>
          </section>
          <div className="filters saved-stream-filter" aria-label="저장 자료 종류">
            {(["all", "news", "community"] as const).map((value) => <button key={value} className={savedStream === value ? "filter active" : "filter"} aria-pressed={savedStream === value} onClick={() => setSavedStream(value)}>{value === "all" ? "전체" : value === "news" ? "일반 뉴스" : "커뮤니티·밈"}</button>)}
          </div>
          <section className="saved-list">
            {savedArticles
              .filter((record) => record.broadcastDates.includes(selectedBroadcastDate) && (savedStream === "all" || candidateStream(record.candidate) === savedStream))
              .sort((a, b) => a.candidate.score < b.candidate.score ? 1 : -1)
              .map((record) => (
                <article className="saved-card" key={record.id}>
                  <div className="signal-meta">
                    <span className="badge">{candidateStream(record.candidate) === "news" ? "일반 뉴스" : "커뮤니티·밈"}</span>
                  <span className="badge">{record.candidate.category}</span>
                    <span className="decision candidate">점수 {record.candidate.score}</span>
                  </div>
                  <h2>{record.candidate.title}</h2>
                  {record.candidate.caveats?.length ? <details className="article-details"><summary>방송 전 확인할 주의사항</summary><ul>{record.candidate.caveats.map((caveat, index) => <li key={index}>{caveat}</li>)}</ul></details> : null}
                  <p className="summary">{summaryPreview(record.candidate.why_now?.trim() || record.candidate.summary)}</p>
                  {record.labels.length > 0 && (
                    <div className="personal-labels">
                      {record.labels.map((label) => (
                        <button key={label} title="이 분류 삭제" onClick={() => removeLabel(record.id, label)}>{label} ×</button>
                      ))}
                    </div>
                  )}
                  <label className="note-field">
                    방송 메모
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={record.note}
                      placeholder="이 기사를 방송에서 어떻게 소개할지 메모하세요."
                      onChange={(event) => updateRecord(record.id, (current) => ({
                        ...current,
                        note: event.target.value,
                      }))}
                    />
                  </label>
                  <div className="card-footer">
                    <span>{record.candidate.source_name}</span>
                    <div className="saved-card-actions">
                      <button className="link" onClick={() => void openUrl(record.candidate.url)}>원문 보기 ↗</button>
                      <button
                        className="danger"
                        onClick={() => updateRecord(record.id, (current) => ({
                          ...current,
                          broadcastDates: current.broadcastDates.filter((date) => date !== selectedBroadcastDate),
                        }))}
                      >
                        이 날짜에서 제거
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            {!savedArticles.some((record) => record.broadcastDates.includes(selectedBroadcastDate) && (savedStream === "all" || candidateStream(record.candidate) === savedStream)) && (
              <div className="empty-card">
                <strong>이 날짜에 준비한 기사가 없습니다.</strong>
                <span>뉴스 화면에서 방송 날짜를 선택한 뒤 「방송 준비에 담기」를 눌러 보세요.</span>
                <button className="secondary" onClick={() => setTab("today")}>뉴스 보러 가기</button>
              </div>
            )}
          </section>
        </main>
      )}

      {tab === "archive" && (
        <main className="content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">SAVED STORIES</span>
              <h1>보관함</h1>
              <p>관심 뉴스, 직접 분류한 기사, 방송 준비에 담은 기사를 검색할 수 있습니다.</p>
            </div>
            <input
              className="archive-search"
              value={archiveQuery}
              placeholder="제목·분류·메모 검색"
              aria-label="보관함 검색"
              onChange={(event) => setArchiveQuery(event.target.value)}
            />
          </section>
          <div className="filters saved-stream-filter" aria-label="저장 자료 종류">
            {(["all", "news", "community"] as const).map((value) => <button key={value} className={savedStream === value ? "filter active" : "filter"} aria-pressed={savedStream === value} onClick={() => setSavedStream(value)}>{value === "all" ? "전체" : value === "news" ? "일반 뉴스" : "커뮤니티·밈"}</button>)}
          </div>
          <section className="saved-list">
            {archiveRecords.map((record) => (
              <article className="saved-card" key={record.id}>
                <div className="signal-meta">
                  <span className="badge">{candidateStream(record.candidate) === "news" ? "일반 뉴스" : "커뮤니티·밈"}</span>
                  <span className="badge">{record.candidate.category}</span>
                  {record.interested && <span className="decision candidate">관심 뉴스</span>}
                </div>
                <h2>{record.candidate.title}</h2>
                <p className="summary">{summaryPreview(record.candidate.why_now?.trim() || record.candidate.summary)}</p>
                {record.broadcastDates.length > 0 && (
                  <p className="saved-dates">방송 날짜: {record.broadcastDates.join(", ")}</p>
                )}
                {record.labels.length > 0 && (
                  <div className="personal-labels">
                    {record.labels.map((label) => (
                      <button key={label} title="이 분류 삭제" onClick={() => removeLabel(record.id, label)}>{label} ×</button>
                    ))}
                  </div>
                )}
                {record.note.trim() && <p className="saved-note">메모: {record.note}</p>}
                <div className="card-footer">
                  <span>{record.candidate.source_name}</span>
                  <div className="saved-card-actions">
                    <button
                      className="link"
                      onClick={() => void openUrl(record.candidate.url)}
                    >
                      원문 보기 ↗
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        updateRecord(record.id, (current) => ({
                          ...current,
                          broadcastDates: current.broadcastDates.includes(selectedBroadcastDate)
                            ? current.broadcastDates
                            : [...current.broadcastDates, selectedBroadcastDate].sort(),
                        }));
                        setTab("prep");
                      }}
                    >
                      방송 준비에 담기
                    </button>
                    <button className="danger" onClick={() => removeRecord(record.id)}>보관함에서 제거</button>
                  </div>
                </div>
              </article>
            ))}
            {archiveRecords.length === 0 && (
              <div className="empty-card">
                <strong>{archiveQuery.trim() ? "검색 결과가 없습니다." : "현재 조건에 맞는 저장 자료가 없습니다."}</strong>
                <span>뉴스 화면에서 관심 뉴스, 방송 준비 또는 개인 분류를 이용해 기사를 저장하세요.</span>
                {!archiveQuery.trim() && <button className="secondary" onClick={() => setTab("today")}>뉴스 보러 가기</button>}
              </div>
            )}
          </section>
        </main>
      )}

      {tab === "settings" && (
        <div className="content narrow settings-switch">
          <nav className="settings-subtabs">
            <button className={settingsSection === "sources" ? "active" : ""} onClick={() => setSettingsSection("sources")}>뉴스 소스</button>
            <button className={settingsSection === "rules" ? "active" : ""} onClick={() => setSettingsSection("rules")}>뉴스 선별</button>
            <button className={settingsSection === "excluded" ? "active" : ""} onClick={() => setSettingsSection("excluded")}>제외 목록</button>
            <button className={settingsSection === "backup" ? "active" : ""} onClick={() => setSettingsSection("backup")}>백업·복원</button>
            <button className={settingsSection === "security" ? "active" : ""} onClick={() => setSettingsSection("security")}>보안</button>
          </nav>
        </div>
      )}

      {tab === "settings" && settingsSection === "excluded" && (
        <main className="content narrow">
          <section className="panel">
            <h1>제외 목록 ({rejectedItems.length})</h1>
            <section className="learning-panel">
              <h2>제외 성향 학습</h2>
              <label><input type="checkbox" checked={learning.enabled} disabled={running} onChange={(event) => persistLearning({ ...learning, enabled: event.target.checked })} /> 비슷한 새 글에 감점·제외 적용</label>
              <select aria-label="제외 학습 강도" value={learning.mode} disabled={running} onChange={(event) => persistLearning({ ...learning, mode: event.target.value as LearningSettings["mode"] })}>
                <option value="balanced">기본: 주제 또는 핵심 단어 조합이 맞을 때 제외</option>
                <option value="strict">강하게: 구체적인 핵심 단어 하나가 맞아도 제외</option>
              </select>
              <p>지금까지 제외한 제목에서 학습한 규칙 {learnedRules.length}개 · 활성 {activeRules.length}개. 같은 주제를 반복해서 제외할수록 감점이 커집니다. 강하게 일치하면 후보에 넣지 않고, 일부 단어만 겹치면 점수를 낮춥니다.</p>
              <p>일반 뉴스와 커뮤니티 성향은 따로 학습합니다. 대한민국 국가적 비상사태 예외는 추정한 성향으로 숨기지 않으며, 직접 제외한 글은 항상 숨깁니다.</p>
              <details>
                <summary>학습한 주제·핵심 단어 확인 및 수정</summary>
                <input className="archive-search" aria-label="학습 규칙 검색" placeholder="주제·핵심 단어 검색" value={learningQuery} onChange={(event) => setLearningQuery(event.target.value)} />
                <div className="filters">{(["all", "news", "community"] as const).map((value) => <button key={value} className={learningStream === value ? "filter active" : "filter"} onClick={() => setLearningStream(value)}>{value === "all" ? "전체" : value === "news" ? "일반 뉴스" : "커뮤니티·밈"}</button>)}</div>
                {learnedRules.filter((rule) => (learningStream === "all" || rule.stream === learningStream) && rule.label.toLowerCase().includes(learningQuery.toLowerCase())).slice(0, 50).map((rule) => <label className="learning-rule" key={rule.id}>
                  <input type="checkbox" checked={!learning.mutedRuleIds.includes(rule.id)} disabled={running || !learning.enabled} onChange={() => toggleRule(rule)} />
                  <span><strong>{rule.label}</strong><small>{rule.stream === "news" ? "일반 뉴스" : "커뮤니티·밈"} · 제외 이력 {rule.count}회 · 최대 −{rule.weight}점</small></span>
                </label>)}
                <p>검색 결과의 우선순위 50개를 표시합니다. 체크를 해제하면 해당 성향만 적용하지 않습니다. 제목에서 구체적인 주제나 단어 조합을 찾지 못하면 개별 글 제외만 적용됩니다.</p>
              </details>
            </section>
            <p>같은 URL과 동일한 제목의 재게시글을 추천 후보에서 숨깁니다. 보관함에 저장한 메모와 방송 준비 자료는 삭제하지 않습니다. 다시 허용은 직접 제외한 기록을 해제하며, 기본 선별 규칙은 계속 적용됩니다.</p>
            <input className="archive-search" aria-label="제외 목록 검색" value={excludedQuery} placeholder="제목·출처 검색" onChange={(event) => setExcludedQuery(event.target.value)} />
            {rejectedItems.filter((item) => `${item.title} ${item.source_name}`.toLowerCase().includes(excludedQuery.toLowerCase())).slice().reverse().slice(0, 100).map((item) => <article className="excluded-row" key={item.id}>
              <div><span className="badge">{item.stream === "news" ? "일반 뉴스" : "커뮤니티·밈"}</span><h2>{item.title}</h2><p>{item.source_name} · {new Date(item.rejectedAt).toLocaleDateString("ko-KR")}</p><p>핵심 단어: {preferenceTokens(item.title).join(", ") || "구체적인 단어 없음"}</p></div>
              <button className="secondary" disabled={running} onClick={() => allowRejected(item)}>다시 허용</button>
            </article>)}
            {!rejectedItems.length && <p>아직 제외한 후보가 없습니다.</p>}
            <p>검색 결과의 최근 100개를 표시합니다. 다시 허용하면 동일한 제목의 제외 항목도 함께 해제됩니다. 다른 제외 글에서 학습한 성향은 남을 수 있으므로 위의 학습 규칙도 확인하세요.</p>
          </section>
        </main>
      )}

      {tab === "settings" && settingsSection === "backup" && (
        <main className="content narrow">
          <section className="panel">
            <h1>백업·복원</h1>
            <p>보관함의 기사·AI 분석·관심 표시·라벨·메모·방송 날짜와 수집 소스·제외 목록·학습 설정을 JSON 파일 하나로 옮깁니다. 다른 PC에도 같은 앱 버전에서 그대로 복원할 수 있습니다.</p>
            <p>현재 보관함 {savedArticles.length}개 · 수집 소스 {sources.length}개. AI 인증정보는 백업에 포함되지 않습니다.</p>
            <div className="saved-card-actions">
              <button className="primary" disabled={backupBusy || running} onClick={() => void exportBackup()}>백업 내보내기</button>
              <button className="secondary" disabled={backupBusy || running} onClick={() => void importBackup()}>백업 불러오기</button>
            </div>
            <p role="status">{backupStatus}</p>
            {pendingBackup && <div className="backup-preview">
              <h2>복원할 백업 확인</h2>
              <p>내보낸 시각: {new Date(pendingBackup.exportedAt).toLocaleString("ko-KR")}</p>
              <p>기사 {pendingBackup.articles.length}개 · 방송 준비 {pendingBackup.articles.filter((record) => record.broadcastDates.length > 0).length}개 · 소스 {pendingBackup.sources.length}개 · 제외 {pendingBackup.rejectedItems?.length ?? 0}개</p>
              <p>복원하면 현재 보관함·소스 설정·제외 목록을 교체합니다. 기존 내용을 보존하려면 먼저 백업 내보내기를 사용하세요.</p>
              <div className="saved-card-actions">
                <button className="primary" disabled={backupBusy || running} onClick={restoreBackup}>백업 내용으로 복원</button>
                <button className="secondary" onClick={() => setPendingBackup(null)}>취소</button>
              </div>
            </div>}
          </section>
        </main>
      )}

      {tab === "settings" && settingsSection === "sources" && (
        <main className="content narrow">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">ALLOWED SOURCES</span>
                <h1>뉴스 소스</h1>
                <p>공개되어 있다는 이유만으로 재사용 권한이 생기는 것은 아닙니다. 실제 이용이 허용된 RSS/Atom/공식 피드만 활성화하세요.</p>
              </div>
              <div className="panel-actions">
                <button className="secondary" onClick={() => setSources((current) => [...current, ...COMMUNITY_SOURCES.filter((preset) => !current.some((source) => source.url === preset.url))].slice(0, 50))}>커뮤니티 소스 추가</button>
                <button className="secondary" onClick={restoreDefaultSources}>기본 소스 복원</button>
                <button className="secondary" onClick={addSource}>소스 추가</button>
              </div>
            </div>
            <div className="source-list">
              {sources.map((source, index) => (
                <div className="source-row" key={`${source.name}-${index}`}>
                  <input type="checkbox" checked={source.enabled} onChange={(e) => updateSource(index, { enabled: e.target.checked })} aria-label="소스 활성화" />
                  <input value={source.name} onChange={(e) => updateSource(index, { name: e.target.value })} aria-label="소스명" />
                  <input value={source.url} onChange={(e) => updateSource(index, { url: e.target.value })} aria-label="RSS URL" />
                  <select aria-label="수집 방식" value={source.kind ?? "rss"} onChange={(e) => updateSource(index, { kind: e.target.value as Source["kind"] })}><option value="rss">RSS / Atom</option><option value="community">커뮤니티 인기글</option></select>
                  <select disabled={source.kind === "community"} value={source.tier} onChange={(e) => updateSource(index, { tier: e.target.value as Source["tier"] })}>
                    <option value="official">공식</option>
                    <option value="professional">전문매체</option>
                    <option value="approved_feed">{source.kind === "community" ? "공개 목록" : "허가 피드"}</option>
                  </select>
                  <select value={source.category} onChange={(e) => updateSource(index, { category: e.target.value })}>
                    {CATEGORIES.slice(1).map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button className="danger" onClick={() => deleteSource(index)}>삭제</button>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {tab === "settings" && settingsSection === "rules" && (
        <main className="content narrow">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">EDITORIAL RULES</span>
                <h1>뉴스 선별 기준</h1>
                <p>현재 적용되는 기본 규칙입니다. 세부 점수 조절은 향후 설정으로 확장할 수 있습니다.</p>
              </div>
            </div>
            <div className="rules-list">
              <div className="rule-item">
                <strong>범죄·피해 사건과 일반 정치 뉴스 제외</strong>
                <p>살해·살인미수·실종·흉기·납치·성범죄·신상털기 등 피해 중심 사건과 업계에 직접 관련되지 않은 일반 정치 뉴스는 후보에서 제외합니다.</p>
              </div>
              <div className="rule-item">
                <strong>국가적 비상사태</strong>
                <p>대한민국에서 발생한 국가적 비상사태만 예외로 다룹니다. 해외 비상사태와 국가가 불명확한 기사는 제외합니다.</p>
              </div>
              <div className="rule-item">
                <strong>스트리머 관련 산업 뉴스</strong>
                <p>버튜버, 크리에이터, 게임, 방송 플랫폼, AI 제작 도구 등 업계에 직접 영향을 주는 기사는 정치 키워드가 포함되어도 일괄 최하위 처리하지 않습니다.</p>
              </div>
              <div className="rule-item">
                <strong>개인 관심 반영</strong>
                <p>관심 표시, 방송 준비, 개인 분류에서 모은 키워드를 다음 수집의 점수 계산에 전달합니다. 현재 개인화 가산점의 최대치는 25점입니다.</p>
              </div>
            </div>
          </section>
        </main>
      )}

      {tab === "settings" && settingsSection === "security" && (
        <main className="content narrow">
          <section className="security-grid">
            <div className="security-card"><span>01</span><strong>인증정보 비수집</strong><p>Signal Desk는 ChatGPT 비밀번호나 provider 토큰을 직접 받지 않는 구조를 사용합니다.</p></div>
            <div className="security-card"><span>02</span><strong>AI 샌드박스</strong><p>뉴스 분석은 제한된 임시 작업공간에서 실행하고 사용자 파일을 분석 대상으로 제공하지 않습니다.</p></div>
            <div className="security-card"><span>03</span><strong>뉴스 = 비신뢰 입력</strong><p>RSS 내용은 명령이 아니라 데이터로 취급하며 HTML·스크립트·위험 URL을 정제합니다.</p></div>
            <div className="security-card"><span>04</span><strong>업데이트 서명</strong><p>배포 단계에서는 Tauri updater 서명과 Windows 코드 서명을 함께 적용하도록 설계합니다.</p></div>
            <div className="security-card"><span>05</span><strong>텔레메트리 기본 없음</strong><p>사용자 행동·파일·브라우저 기록을 중앙 서버로 자동 전송하지 않는 로컬 우선 구조입니다.</p></div>
            <div className="security-card"><span>06</span><strong>사람이 최종 결정</strong><p>candidate는 방송 승인 상태가 아니며, 원문 확인 후 사람이 최종 채택합니다.</p></div>
          </section>
          <div className="security-note">
            <strong>AI 연결 방식</strong>
            <p>현재 1차 버전에서는 공식 Codex CLI를 provider adapter로 연결합니다. 앱은 Codex 인증 토큰을 직접 읽거나 저장하지 않습니다. CLI가 설치되어 있으면 상태를 확인하고, 로그인은 공식 Codex 브라우저 흐름에서 직접 진행합니다.</p>
            <button className="link" onClick={() => void openUrl("https://developers.openai.com/ko-KR/docs/codex/cli")}>공식 Codex 문서 열기 ↗</button>
          </div>
        </main>
      )}

      {availableUpdate && (
        <div className="update-modal-backdrop" role="dialog" aria-modal="true">
          <div className="update-modal">
            <span className="eyebrow">SIGNAL DESK UPDATE</span>
            <h2>새 버전이 있습니다</h2>
            <p>현재 버전보다 새로운 서명된 업데이트가 발견되었습니다. 업데이트 파일은 Tauri updater 서명 검증을 통과한 경우에만 설치됩니다.</p>
            <div className="update-version">새 버전 {availableUpdate.version}</div>
            {availableUpdate.body ? <pre>{availableUpdate.body}</pre> : null}
            <div className="update-actions">
              <button className="secondary" onClick={() => setAvailableUpdate(null)} disabled={updateBusy}>나중에</button>
              <button className="primary" onClick={() => void installUpdate()} disabled={updateBusy}>{updateBusy ? "업데이트 중…" : "업데이트"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
