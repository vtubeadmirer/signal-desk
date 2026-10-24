import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { learnNegativeRules, activeNegativeRules, applyNegativeRules, negativePenalty, type NegativeRule } from "./negativePreferences";
import { DEFAULT_LEARNING, type LearningSettings, addRejections, exclusionHashes, isRejected, rejectionId, rejectionIndex, normalizedTitle, type RejectedItem } from "./rejections";
import { candidateStream, sourceStream, streamCandidates, replaceStream, type SignalStream, type SavedStream } from "./streams";
import { parseBackup, serializeBackup, type DeskBackup } from "./backup";
import { readBackupFile, saveBackupFile } from "./backupFiles";
import { analyze, cancelCollection, collect, health } from "./agent";
import { CATEGORIES, COMMUNITY_SOURCES, articleId, isSavedArticle } from "./storage";
import { flushState, saveState, writeSnapshot } from "./persist";
import { findPriorBroadcast } from "./history";
import { watchMatches } from "./watchlist";
import { appendRun, persistentHit, persistentTerms, suggestWatchTerms, type CollectionEntry } from "./weekly";
import { preferenceTokens } from "./negativePreferences";
import { type PriorBroadcast } from "./history";
import { type SortMode } from "./streams";
import { WeeklyTab } from "./components/WeeklyTab";
import { BriefingTab } from "./components/BriefingTab";
import { ResearchTab } from "./components/ResearchTab";
import { research as researchRequest } from "./agent";
import { buildResearchView, normalizeKeyword, type ResearchView } from "./research";
import { addWatchTerm } from "./watchlist";
import { buildBriefing, type Briefing } from "./briefing";
import { localDateKey } from "./storage";
import type { DeskState } from "./state";
import type { ArticleRecord, Candidate, PersonalizationProfile, Source } from "./types";
import { ArchiveTab } from "./components/ArchiveTab";
import { CandidateCard } from "./components/CandidateCard";
import { ExcludedPanel } from "./components/ExcludedPanel";
import { PrepTab } from "./components/PrepTab";
import { BackupPanel, RulesPanel, SecurityPanel, SettingsNav, SourcesPanel, type SettingsSection } from "./components/SettingsPanels";
import { UpdateModal } from "./components/UpdateModal";

type Tab = "briefing" | "today" | "community" | "research" | "weekly" | "prep" | "archive" | "settings";

export default function App({ initial, migrated, loadError }: { initial: DeskState; migrated: boolean; loadError?: string }) {
  const [tab, setTab] = useState<Tab>("today");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("sources");
  const [sources, setSources] = useState<Source[]>(initial.sources);
  const [provider, setProvider] = useState(initial.provider);
  const [status, setStatus] = useState(loadError ?? (migrated ? "이전 버전의 데이터를 새 저장 방식으로 옮겼습니다." : "준비됨"));
  const [providerStatus, setProviderStatus] = useState<{ installed: boolean; authenticated?: boolean; version?: string; auth_hint?: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [savedArticles, setSavedArticles] = useState<ArticleRecord[]>(initial.articles);
  const [rejectedItems, setRejectedItems] = useState<RejectedItem[]>(initial.rejectedItems);
  const rejectedIndex = useMemo(() => rejectionIndex(rejectedItems), [rejectedItems]);
  const [learning, setLearning] = useState<LearningSettings>(initial.rejectionLearning);
  const [learningQuery, setLearningQuery] = useState("");
  const [learningStream, setLearningStream] = useState<SavedStream>("all");
  const learnedRules = useMemo(() => learnNegativeRules(rejectedItems, learning.mode), [rejectedItems, learning.mode]);
  const activeRules = useMemo(() => activeNegativeRules(learnedRules, learning), [learnedRules, learning]);
  const learnedCandidates = useMemo(() => applyNegativeRules(candidates, activeRules), [candidates, activeRules]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [excludedQuery, setExcludedQuery] = useState("");
  const [selectedBroadcastDate, setSelectedBroadcastDate] = useState(initial.selectedBroadcastDate);
  const [communityPresetsApplied, setCommunityPresetsApplied] = useState(initial.communityPresetsApplied);
  const [watchlist, setWatchlist] = useState<string[]>(initial.watchlist);
  const [collectionLog, setCollectionLog] = useState<CollectionEntry[]>(initial.collectionLog);
  const [routineOnLaunch, setRoutineOnLaunch] = useState(initial.routineOnLaunch);
  const [briefingOverride, setBriefingOverride] = useState<Briefing | null>(null);
  const [researchKeyword, setResearchKeyword] = useState("");
  const [researchDays, setResearchDays] = useState(14);
  const [researchRemote, setResearchRemote] = useState<{ keyword: string; items: Candidate[] } | null>(null);
  const [researchStatus, setResearchStatus] = useState("");
  const [researching, setResearching] = useState(false);
  const [keepArchiveOnRestore, setKeepArchiveOnRestore] = useState(false);
  const today = localDateKey();
  const weeklyTerms = useMemo(() => persistentTerms(collectionLog, today), [collectionLog, today]);
  const watchSuggestions = useMemo(() => suggestWatchTerms(collectionLog, watchlist, today), [collectionLog, watchlist, today]);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [followUpsOnly, setFollowUpsOnly] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
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
  const [collecting, setCollecting] = useState(false);
  const [lastRuns, setLastRuns] = useState<Record<SignalStream, string>>({ news: "", community: "" });
  const lastRun = lastRuns[stream];
  function setLastRun(value: string) { setLastRuns((current) => ({ ...current, [stream]: value })); }
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [pendingBackup, setPendingBackup] = useState<DeskBackup | null>(null);

  useEffect(() => {
    if (!communityPresetsApplied) {
      setSources((current) => [...current, ...COMMUNITY_SOURCES.filter((preset) => !current.some((source) => source.url === preset.url))].slice(0, 50));
      setCommunityPresetsApplied(true);
    }
  }, [communityPresetsApplied]);

  const persisted = useMemo<DeskState>(() => ({
    version: 1, sources, provider, articles: savedArticles, rejectedItems, rejectionLearning: learning, selectedBroadcastDate, communityPresetsApplied, watchlist, collectionLog, routineOnLaunch,
  }), [sources, provider, savedArticles, rejectedItems, learning, selectedBroadcastDate, communityPresetsApplied, watchlist, collectionLog, routineOnLaunch]);
  useEffect(() => {
    // Safety copies: one tagged snapshot right after a migration, and one per day on launch.
    const today = localDateKey();
    void (async () => {
      if (migrated) await writeSnapshot(initial, today, "migration");
      await writeSnapshot(initial, today);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstRender = useRef(true);
  useEffect(() => {
    // Skip the mount pass unless we just migrated and must write the new file right away.
    if (firstRender.current) { firstRender.current = false; if (!migrated) return; }
    saveState(persisted, () => setStatus("데이터를 저장하지 못했습니다. 디스크 공간을 확인하고 백업 내보내기로 내용을 보존하세요."));
  }, [persisted, migrated]);

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
    // The release scaffold ships placeholder updater keys; asking GitHub for a
    // non-existent manifest on every launch is pointless until they are set.
    if (__UPDATER_CONFIGURED__) void checkForUpdate();
    if (initial.routineOnLaunch) void runRoutine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [releaseNotice, setReleaseNotice] = useState<{ version: string; notes: string } | null>(null);
  useEffect(() => {
    let alive = true;
    async function checkRelease() {
      try {
        const response = await fetch("https://api.github.com/repos/vtubeadmirer/signal-desk/releases/latest", { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const release = await response.json();
        if (release.draft || release.prerelease || typeof release.tag_name !== "string") return;
        const version: string = release.tag_name.replace(/^v/, "");
        if (!/^\d+\.\d+\.\d+$/.test(version)) return;
        const remote = version.split(".").map(Number), local = __APP_VERSION__.split(".").map(Number);
        const difference = remote.map((part, index) => part - local[index]).find(value => value !== 0) ?? 0;
        if (alive && difference > 0) setReleaseNotice({ version, notes: typeof release.body === "string" ? release.body.slice(0, 30000) : "새 버전이 배포되었습니다." });
      } catch { /* Offline checks must not interrupt news collection. */ }
    }
    void checkRelease();
    const timer = window.setInterval(() => void checkRelease(), 60 * 60 * 1000);
    return () => { alive = false; window.clearInterval(timer); };
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

  const broadcastRecords = useMemo(() => savedArticles.filter((record) => record.broadcastDates.length > 0), [savedArticles]);
  const ranked = useMemo(() => {
    return streamCandidates(learnedCandidates.filter((item) => !isRejected(item, rejectedIndex)), stream, filter, watchlist, sortMode);
  }, [learnedCandidates, stream, filter, rejectedIndex, watchlist, sortMode]);
  const priorByEvent = useMemo(() => new Map(ranked.map((item) => [item.event_id, findPriorBroadcast(item, broadcastRecords, today)] as [string, PriorBroadcast | null])), [ranked, broadcastRecords, today]);
  const followUpCount = useMemo(() => ranked.filter((item) => priorByEvent.get(item.event_id)?.followUp).length, [ranked, priorByEvent]);
  const filtered = useMemo(() => followUpsOnly ? ranked.filter((item) => priorByEvent.get(item.event_id)?.followUp) : ranked, [ranked, followUpsOnly, priorByEvent]);
  const researchView = useMemo<ResearchView | null>(() => researchRemote ? buildResearchView(researchRemote.keyword, researchRemote.items, candidates, collectionLog, savedArticles) : null, [researchRemote, candidates, collectionLog, savedArticles]);
  const autoBriefing = useMemo(() => buildBriefing(learnedCandidates.filter((item) => !isRejected(item, rejectedIndex)), savedArticles, watchlist, today), [learnedCandidates, rejectedIndex, savedArticles, watchlist, today]);
  const briefing = briefingOverride ?? autoBriefing;
  useEffect(() => { setBriefingOverride(null); }, [learnedCandidates]);

  const visibleCandidates = showMoreCandidates ? filtered : filtered.slice(0, 10);
  const checkedCandidates = learnedCandidates.filter((item) => candidateStream(item) === stream && !isRejected(item, rejectedIndex) && checkedIds.includes(rejectionId(item.url)));
  const allVisibleChecked = visibleCandidates.length > 0 && visibleCandidates.every((item) => checkedIds.includes(rejectionId(item.url)));
  const savedById = useMemo(() => new Map(savedArticles.map((record) => [record.id, record])), [savedArticles]);

  function toggleChecked(id: string) {
    setCheckedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleVisibleChecked() {
    const ids = visibleCandidates.map((item) => rejectionId(item.url));
    setCheckedIds((current) => allVisibleChecked ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  function persistLearning(settings: LearningSettings) {
    setLearning(settings);
    setCheckedIds([]);
    setStatus("제외 성향 설정을 저장했습니다. 다음 수집부터 해당 성향으로 후보를 선별합니다.");
  }

  function toggleRule(rule: NegativeRule) {
    const muted = learning.mutedRuleIds.includes(rule.id);
    const next = muted ? learning.mutedRuleIds.filter((id) => id !== rule.id) : [...learning.mutedRuleIds, rule.id];
    if (next.length > 1000) { setStatus("비활성 규칙은 최대 1,000개입니다."); return; }
    persistLearning({ ...learning, mutedRuleIds: next });
  }

  function persistRejections(items: RejectedItem[]) {
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
    // Latest recorded reaction decides: "skipped"/"flat" stories stop feeding positive signals, "hot" ones feed more of them.
    const latestReaction = (record: ArticleRecord) => {
      const dates = Object.keys(record.reactions ?? {}).sort();
      return dates.length ? record.reactions![dates[dates.length - 1]] : null;
    };
    const chosen = savedArticles.filter((record) => candidateStream(record.candidate) === stream && !isRejected(record.candidate, rejectedIndex) && negativePenalty(record.candidate, activeRules).penalty < 40).filter((record) =>
      (record.interested || record.broadcastDates.length > 0 || record.labels.length > 0) && !(latestReaction(record) === "skipped" || (latestReaction(record) === "flat" && !record.interested))
    );
    const keywords = new Set<string>();
    const categories = new Set<string>();
    const labels = new Set<string>();

    for (const record of chosen) {
      categories.add(record.candidate.category);
      if (latestReaction(record) === "hot") for (const token of preferenceTokens(record.candidate.title)) keywords.add(token);
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

  function updateArticleRecord(item: Candidate, change: (record: ArticleRecord) => ArticleRecord) {
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

  function updateRecord(id: string, change: (record: ArticleRecord) => ArticleRecord) {
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
    updateArticleRecord(item, (record) => ({ ...record, interested: !record.interested }));
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
    updateRecord(id, (record) => ({ ...record, labels: record.labels.filter((value) => value !== label) }));
  }

  async function runCollection(target: SignalStream = stream): Promise<boolean> {
    const label = target === "news" ? "일반 뉴스" : "커뮤니티·밈";
    const targetSources = sources.filter((source) => source.enabled && sourceStream(source) === target);
    if (!targetSources.length) { setStatus(`${label} 소스가 없어 수집을 건너뜁니다.`); return false; }
    setRunning(true);
    setCollecting(true);
    setStatus(`${label} 수집 및 후보 선별 중…`);
    try {
      const r = await collect(targetSources, personalization, target, await exclusionHashes(rejectedItems), activeRules.filter((rule) => rule.stream === target), watchlist);
      if (!r.ok) throw new Error(r.error ?? "수집 실패");
      const freshCandidates = r.candidates ?? [];
      setCandidates((current) => replaceStream(current, freshCandidates, target));
      setCollectionLog((current) => appendRun(current, freshCandidates, target, localDateKey()));
      const previousIds = candidates.filter((item) => candidateStream(item) === target).map((item) => rejectionId(item.url));
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
      setExpanded((current) => ({ ...current, [target]: false }));
      setLastRuns((current) => ({ ...current, [target]: new Date().toLocaleString("ko-KR") }));
      setFocusedId(null);
      setFollowUpsOnly(false);
      setStatus(`${label} 후보 ${r.candidates?.length ?? 0}개를 만들었습니다.${r.cancelled ? " 중단 요청으로 받은 소스까지만 반영했습니다." : ""}${r.negative_stats ? ` 제외 성향으로 ${r.negative_stats.suppressed}건 제외 · ${r.negative_stats.demoted}건 감점.` : ""}${r.errors?.length ? ` 수집 실패: ${r.errors.join(" / ")}` : ""}`);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "수집 중 오류가 발생했습니다.");
      return false;
    } finally {
      setCollecting(false);
      setRunning(false);
      await refreshHealth();
    }
  }

  async function runResearch() {
    const keyword = normalizeKeyword(researchKeyword);
    if (keyword.length < 2) return;
    setResearching(true);
    setRunning(true);
    setResearchStatus(`「${keyword}」 관련 기사를 모으는 중…`);
    try {
      const r = await researchRequest(keyword, researchDays);
      if (!r.ok) throw new Error(r.error ?? "리서치 실패");
      setResearchRemote({ keyword, items: r.candidates ?? [] });
      setResearchStatus(`${r.message ?? ""}${r.errors?.length ? ` · ${r.errors.join(" / ")}` : ""}`);
    } catch (error) {
      setResearchStatus(error instanceof Error ? error.message : "리서치 중 오류가 발생했습니다.");
    } finally {
      setResearching(false);
      setRunning(false);
    }
  }

  /** 방송 전 루틴: 뉴스 → 커뮤니티 수집, then land on the briefing with today's picks. */
  async function runRoutine() {
    setTab("briefing");
    const news = await runCollection("news");
    const community = await runCollection("community");
    setBriefingOverride(null);
    if (news || community) setStatus("오늘의 토크를 골랐습니다. 마음에 안 드는 항목은 「교체」, 전부 좋으면 「모두 담기」.");
  }

  async function runAiAnalysis() {
    if (!filtered.length) return;
    setRunning(true);
    setStatus(`${streamLabel} 상위 후보만 AI 분석 중…`);
    try {
      const r = await analyze(filtered.slice(0, 15), provider);
      if (!r.ok) throw new Error(r.error ?? "AI 분석 실패");
      const analyzedById = new Map((r.candidates ?? []).map((item) => [item.event_id, item]));
      setCandidates((current) => current.map((item) => ({ ...item, ...(analyzedById.get(item.event_id) ?? {}) })));
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

  function backupData() {
    return { articles: savedArticles, sources, provider: "codex" as const, selectedBroadcastDate, rejectedItems, rejectionLearning: learning, watchlist, collectionLog, routineOnLaunch };
  }

  async function exportBackup(settingsOnly = false) {
    setBackupBusy(true);
    try {
      const data = settingsOnly ? { ...backupData(), articles: [], rejectedItems: [], collectionLog: [] } : backupData();
      const saved = await saveBackupFile(serializeBackup(data));
      setBackupStatus(saved ? (settingsOnly ? "설정만 담은 백업을 저장했습니다. 불러올 때 「설정만 복원」이 자동으로 켜집니다." : "백업을 저장했습니다. 다른 PC의 Signal Desk에서 이 파일을 불러오세요.") : "내보내기를 취소했습니다.");
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : "백업 저장에 실패했습니다."); }
    finally { setBackupBusy(false); }
  }

  async function importBackup() {
    setBackupBusy(true);
    try {
      const raw = await readBackupFile();
      if (raw === null) { setBackupStatus("불러오기를 취소했습니다."); return; }
      const parsed = parseBackup(raw);
      setPendingBackup(parsed);
      setKeepArchiveOnRestore(parsed.articles.length === 0 && !(parsed.rejectedItems?.length));
      setBackupStatus("백업 내용을 확인한 뒤 복원하세요. 현재 보관함과 설정이 백업 내용으로 교체됩니다.");
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : "백업을 읽지 못했습니다."); }
    finally { setBackupBusy(false); }
  }

  async function restoreBackup() {
    if (!pendingBackup) return;
    setBackupBusy(true);
    try {
      // Write the whole document first; state only changes once the file is safely on disk.
      const keep = keepArchiveOnRestore;
      const nextArticles = keep ? savedArticles : pendingBackup.articles;
      const nextRejected = keep ? rejectedItems : pendingBackup.rejectedItems ?? [];
      const nextLog = keep ? collectionLog : pendingBackup.collectionLog ?? [];
      await flushState({
        version: 1,
        sources: pendingBackup.sources,
        provider: pendingBackup.provider,
        articles: nextArticles,
        rejectedItems: nextRejected,
        rejectionLearning: pendingBackup.rejectionLearning ?? DEFAULT_LEARNING,
        selectedBroadcastDate: keep ? selectedBroadcastDate : pendingBackup.selectedBroadcastDate,
        communityPresetsApplied: true,
        watchlist: pendingBackup.watchlist ?? [],
        collectionLog: nextLog,
        routineOnLaunch: pendingBackup.routineOnLaunch ?? false,
      });
      setRoutineOnLaunch(pendingBackup.routineOnLaunch ?? false);
      setWatchlist(pendingBackup.watchlist ?? []);
      setCollectionLog(nextLog);
      setSavedArticles(nextArticles);
      setRejectedItems(nextRejected);
      setLearning(pendingBackup.rejectionLearning ?? DEFAULT_LEARNING);
      setCheckedIds([]);
      setSources(pendingBackup.sources);
      setProvider(pendingBackup.provider);
      if (!keep) setSelectedBroadcastDate(pendingBackup.selectedBroadcastDate);
      setCandidates([]);
      setLastRuns({ news: "", community: "" });
      setFilters({ news: "전체", community: "전체" });
      setExpanded({ news: false, community: false });
      setSavedStream("all");
      setArchiveQuery("");
      setCommunityPresetsApplied(true);
      setPendingBackup(null);
      setBackupStatus(keep ? "소스·워치리스트·학습 설정을 복원했습니다. 보관함과 제외 목록은 그대로입니다." : "보관함·방송 준비·소스 설정을 복원했습니다. AI 로그인은 이 PC에서 연결하세요.");
    } catch { setBackupStatus("저장 공간이 부족하거나 저장소에 접근할 수 없어 복원하지 못했습니다. 기존 데이터는 유지됩니다."); }
    finally { setBackupBusy(false); }
  }

  // --- Keyboard navigation on the candidate list -------------------------------------------
  const focusedIndex = focusedId ? visibleCandidates.findIndex((item) => item.event_id === focusedId) : -1;
  useEffect(() => {
    if (tab !== "briefing") return;
    function onDigit(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const n = Number(event.key);
      if (!Number.isInteger(n) || n < 1 || n > briefing.picks.length) return;
      event.preventDefault();
      void openUrl(briefing.picks[n - 1].item.url);
    }
    window.addEventListener("keydown", onDigit);
    return () => window.removeEventListener("keydown", onDigit);
  });
  useEffect(() => {
    if (tab !== "today" && tab !== "community") return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (!visibleCandidates.length) return;
      const key = event.key.toLowerCase();
      const move = (delta: number) => {
        const start = focusedIndex < 0 ? (delta > 0 ? -1 : visibleCandidates.length) : focusedIndex;
        const next = Math.min(visibleCandidates.length - 1, Math.max(0, start + delta));
        const item = visibleCandidates[next];
        setFocusedId(item.event_id);
        document.querySelector(`[data-candidate-id="${item.event_id}"]`)?.scrollIntoView({ block: "nearest" });
      };
      if (key === "j" || key === "arrowdown") { event.preventDefault(); move(1); return; }
      if (key === "k" || key === "arrowup") { event.preventDefault(); move(-1); return; }
      const item = focusedIndex >= 0 ? visibleCandidates[focusedIndex] : null;
      if (!item) return;
      if (key === "x" && !running) { event.preventDefault(); rejectCandidates([item]); move(1); }
      else if (key === "s") { event.preventDefault(); toggleInterest(item); }
      else if (key === "b") { event.preventDefault(); toggleBroadcastDate(item); }
      else if (key === "c") { event.preventDefault(); toggleChecked(rejectionId(item.url)); }
      else if (key === "o" || key === "enter") { event.preventDefault(); void openUrl(item.url); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function cancelRunningCollection() {
    setStatus("수집을 중단하고 지금까지 받은 소스로 후보를 만듭니다…");
    const accepted = await cancelCollection().catch(() => false);
    if (!accepted) setStatus("중단할 수집이 없습니다.");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">SIGNAL DESK <small>v{__APP_VERSION__}</small></div>
          <div className="subtitle">오늘 방송에서 이야기할 만한 신호만 압축합니다.</div>
        </div>
        <div className="top-actions">
          <span className={`status-dot ${providerStatus?.authenticated ? "ok" : "warn"}`} />
          <span>{providerStatus?.authenticated ? `Codex ${providerStatus.version ?? "인증됨"}` : providerStatus?.installed ? "Codex 로그인 필요" : "AI 연결 필요"}</span>
        </div>
      </header>

      {releaseNotice && <section className="card" aria-label="업데이트 안내" aria-live="polite">
        <h2>Signal Desk v{releaseNotice.version} 업데이트</h2>
        <details><summary>업데이트 내역 보기</summary><pre style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>{releaseNotice.notes}</pre></details>
        <button className="primary" onClick={() => void openUrl("https://github.com/vtubeadmirer/signal-desk/releases/latest")}>새 버전 다운로드</button>
        <button className="secondary" onClick={() => setReleaseNotice(null)}>나중에</button>
      </section>}
      <nav className="tabs">
        {([["briefing", "오늘의 토크"], ["today", "일반 뉴스"], ["community", "커뮤니티·밈"], ["research", "키워드 리서치"], ["weekly", "주간 흐름"], ["prep", "방송 준비"], ["archive", "보관함"], ["settings", "환경설정"]] as [Tab, string][]).map(([value, label]) => (
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
        ))}
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
              <button className="primary" disabled={running || activeSources.length === 0} onClick={() => void runCollection()}>
                {running ? "처리 중…" : stream === "news" ? "뉴스 가져오기" : "커뮤니티 소식 가져오기"}
              </button>
              {collecting && <button className="secondary" onClick={() => void cancelRunningCollection()}>중단하고 지금까지로</button>}
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
            <div className="view-toggles">
              <button className={sortMode === "chat" ? "filter active" : "filter"} aria-pressed={sortMode === "chat"} title="대화성·토론형·댓글 수·워치리스트를 합산한 순서" onClick={() => setSortMode(sortMode === "chat" ? "score" : "chat")}>채팅 터질 순</button>
              <button className={followUpsOnly ? "filter active" : "filter"} aria-pressed={followUpsOnly} disabled={!followUpCount && !followUpsOnly} title="최근 14일 안에 방송한 이야기의 새 기사만" onClick={() => setFollowUpsOnly(!followUpsOnly)}>지난 방송 후속 {followUpCount}</button>
            </div>
            <div className="run-info">{lastRun ? `마지막 실행 ${lastRun}` : status}</div>
          </section>

          <section className="rejection-toolbar" aria-label="후보 제외">
            <label><input type="checkbox" checked={allVisibleChecked} disabled={running || visibleCandidates.length === 0} onChange={toggleVisibleChecked} /> 보이는 후보 모두 선택</label>
            <button className="danger" disabled={running || checkedCandidates.length === 0} onClick={() => rejectCandidates(checkedCandidates)}>선택 {checkedCandidates.length}개 제외</button>
            <button className="secondary" onClick={() => { setTab("settings"); setSettingsSection("excluded"); }}>제외 목록 ({rejectedItems.length})</button>
            <span>제외한 글은 다음 수집과 AI 분석에서도 빠집니다.</span>
            <span className="shortcut-hint" title="입력창 밖에서 동작합니다"><kbd>J</kbd><kbd>K</kbd> 이동 · <kbd>X</kbd> 제외 · <kbd>S</kbd> 관심 · <kbd>B</kbd> 방송 준비 · <kbd>C</kbd> 선택 · <kbd>O</kbd> 원문</span>
          </section>
          <section className="signals-grid">
            {filtered.length === 0 ? (
              <div className="empty-card">
                <strong>{streamLabel} 후보가 없습니다.</strong>
                <span>{stream === "news" ? "RSS/Atom 소스를 활성화한 뒤 「뉴스 가져오기」를 누르세요." : "커뮤니티 소스를 활성화한 뒤 「커뮤니티 소식 가져오기」를 누르세요."}</span>
              </div>
            ) : visibleCandidates.map((item) => {
              const id = articleId(item.url);
              return (
                <CandidateCard
                  key={item.event_id}
                  item={item}
                  record={savedById.get(id)}
                  running={running}
                  checked={checkedIds.includes(rejectionId(item.url))}
                  focused={item.event_id === focusedId}
                  watchHits={watchMatches(item, watchlist)}
                  priorBroadcast={priorByEvent.get(item.event_id) ?? null}
                  persistent={persistentHit(item, weeklyTerms)}
                  selectedBroadcastDate={selectedBroadcastDate}
                  labelDraft={labelDrafts[id] ?? ""}
                  onToggleChecked={() => toggleChecked(rejectionId(item.url))}
                  onReject={() => rejectCandidates([item])}
                  onToggleInterest={() => toggleInterest(item)}
                  onToggleBroadcastDate={() => toggleBroadcastDate(item)}
                  onLabelDraftChange={(value) => setLabelDrafts((current) => ({ ...current, [id]: value }))}
                  onAddLabel={() => addLabel(item)}
                  onRemoveLabel={(label) => removeLabel(id, label)}
                />
              );
            })}
          </section>
          {filtered.length > 10 && (
            <div className="candidate-expand">
              <button className="secondary" onClick={() => setShowMoreCandidates(!showMoreCandidates)}>
                {showMoreCandidates ? "추가 후보 접기" : `추가 후보 ${filtered.length - 10}개 펼쳐보기`}
              </button>
            </div>
          )}
        </main>
      )}

      {tab === "briefing" && (
        <BriefingTab
          briefing={briefing}
          onBriefingChange={setBriefingOverride}
          date={selectedBroadcastDate}
          running={running}
          hasCandidates={candidates.length > 0}
          isPlanned={(item) => Boolean(savedById.get(articleId(item.url))?.broadcastDates.includes(selectedBroadcastDate))}
          onAddOne={(item) => toggleBroadcastDate(item)}
          onAddAll={(items) => { for (const item of items) if (!savedById.get(articleId(item.url))?.broadcastDates.includes(selectedBroadcastDate)) toggleBroadcastDate(item); setStatus(`${items.length}개를 ${selectedBroadcastDate} 방송 준비에 담았습니다.`); }}
          onRunRoutine={() => void runRoutine()}
          goToPrep={() => setTab("prep")}
          goToNews={() => setTab("today")}
        />
      )}

      {tab === "research" && (
        <ResearchTab
          view={researchView}
          keyword={researchKeyword}
          onKeywordChange={setResearchKeyword}
          days={researchDays}
          onDaysChange={setResearchDays}
          running={researching}
          status={researchStatus}
          onRun={() => void runResearch()}
          watchlist={watchlist}
          onAddWatch={(term) => { setWatchlist((current) => addWatchTerm(current, term)); setStatus(`「${term}」을(를) 워치리스트에 추가했습니다.`); }}
          isPlanned={(item) => Boolean(savedById.get(articleId(item.url))?.broadcastDates.includes(selectedBroadcastDate))}
          onAddToPrep={(item) => toggleBroadcastDate(item)}
        />
      )}

      {tab === "weekly" && (
        <WeeklyTab
          log={collectionLog}
          records={savedArticles}
          today={today}
          goToNews={() => setTab("today")}
          onAddToPrep={(entry) => {
            // Rebuild a minimal candidate from the log line so it can live in the archive like any other saved story.
            const stub: Candidate = {
              priority: 0, slide_order: 0, category: entry.category, event_id: `${entry.stream}-log-${entry.id}`, decision: entry.stream === "community" ? "manual_review" : "candidate",
              content_type: entry.stream === "community" ? "community" : "news", source_type: entry.stream === "community" ? "community" : "media",
              collection_method: entry.stream === "community" ? "public_list" : "rss", usage_status: "review_required", score: entry.score, score_raw: 0,
              talkability: 0, verification_cost: 50, source_ready: true, context_required: 30, title: entry.title, summary: "주간 흐름의 수집 기록에서 담은 기사입니다. 원문에서 내용을 확인하세요.",
              source_name: "", url: entry.url, published_at: `${entry.date}T00:00:00+09:00`, keywords: [], source_count: entry.source_count, frames: [],
            };
            toggleBroadcastDate(stub);
            setTab("prep");
          }}
        />
      )}

      {tab === "prep" && (
        <PrepTab
          savedArticles={savedArticles}
          selectedBroadcastDate={selectedBroadcastDate}
          onDateChange={setSelectedBroadcastDate}
          savedStream={savedStream}
          onSavedStreamChange={setSavedStream}
          updateRecord={updateRecord}
          removeLabel={removeLabel}
          goToNews={() => setTab("today")}
        />
      )}

      {tab === "archive" && (
        <ArchiveTab
          records={archiveRecords}
          archiveQuery={archiveQuery}
          onQueryChange={setArchiveQuery}
          savedStream={savedStream}
          onSavedStreamChange={setSavedStream}
          selectedBroadcastDate={selectedBroadcastDate}
          updateRecord={updateRecord}
          removeLabel={removeLabel}
          removeRecord={removeRecord}
          goToNews={() => setTab("today")}
          goToPrep={() => setTab("prep")}
        />
      )}

      {tab === "settings" && <SettingsNav section={settingsSection} onChange={setSettingsSection} />}
      {tab === "settings" && settingsSection === "excluded" && (
        <ExcludedPanel
          rejectedItems={rejectedItems}
          learning={learning}
          learnedRules={learnedRules}
          activeRules={activeRules}
          running={running}
          learningQuery={learningQuery}
          onLearningQueryChange={setLearningQuery}
          learningStream={learningStream}
          onLearningStreamChange={setLearningStream}
          excludedQuery={excludedQuery}
          onExcludedQueryChange={setExcludedQuery}
          persistLearning={persistLearning}
          toggleRule={toggleRule}
          allowRejected={allowRejected}
        />
      )}
      {tab === "settings" && settingsSection === "backup" && (
        <BackupPanel
          savedCount={savedArticles.length}
          sourceCount={sources.length}
          busy={backupBusy || running}
          status={backupStatus}
          pending={pendingBackup}
          onExport={() => void exportBackup(false)}
          onExportSettings={() => void exportBackup(true)}
          keepArchive={keepArchiveOnRestore}
          onKeepArchiveChange={setKeepArchiveOnRestore}
          onImport={() => void importBackup()}
          onRestore={() => void restoreBackup()}
          onCancel={() => setPendingBackup(null)}
        />
      )}
      {tab === "settings" && settingsSection === "sources" && <SourcesPanel sources={sources} onChange={setSources} />}
      {tab === "settings" && settingsSection === "rules" && <RulesPanel watchlist={watchlist} onWatchlistChange={setWatchlist} suggestions={watchSuggestions} routineOnLaunch={routineOnLaunch} onRoutineOnLaunchChange={setRoutineOnLaunch} />}
      {tab === "settings" && settingsSection === "security" && <SecurityPanel />}

      {availableUpdate && (
        <UpdateModal update={availableUpdate} busy={updateBusy} onLater={() => setAvailableUpdate(null)} onInstall={() => void installUpdate()} />
      )}
    </div>
  );
}
