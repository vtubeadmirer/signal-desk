import { useEffect, useMemo, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { learnNegativeRules, activeNegativeRules, applyNegativeRules, negativePenalty, type NegativeRule } from "./negativePreferences";
import { DEFAULT_LEARNING, type LearningSettings, addRejections, exclusionHashes, isRejected, rejectionId, rejectionIndex, normalizedTitle, type RejectedItem } from "./rejections";
import { candidateStream, sourceStream, streamCandidates, replaceStream, type SignalStream, type SavedStream } from "./streams";
import { parseBackup, serializeBackup, writeStorageAtomically, type DeskBackup } from "./backup";
import { readBackupFile, saveBackupFile } from "./backupFiles";
import { analyze, collect, health } from "./agent";
import {
  ARTICLES_KEY, CATEGORIES, COMMUNITY_MIGRATION_KEY, COMMUNITY_SOURCES, DATE_KEY, LEARNING_KEY, PROVIDER_KEY, REJECTIONS_KEY, STORAGE_KEY,
  articleId, isSavedArticle, loadLearning, loadRejections, loadSavedArticles, loadSources, localDateKey,
} from "./storage";
import type { ArticleRecord, Candidate, PersonalizationProfile } from "./types";
import { ArchiveTab } from "./components/ArchiveTab";
import { CandidateCard } from "./components/CandidateCard";
import { ExcludedPanel } from "./components/ExcludedPanel";
import { PrepTab } from "./components/PrepTab";
import { BackupPanel, RulesPanel, SecurityPanel, SettingsNav, SourcesPanel, type SettingsSection } from "./components/SettingsPanels";
import { UpdateModal } from "./components/UpdateModal";

type Tab = "today" | "community" | "prep" | "archive" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("sources");
  const [sources, setSources] = useState(loadSources);
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
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(sources)); }, [sources]);
  useEffect(() => { localStorage.setItem(PROVIDER_KEY, provider); }, [provider]);
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
    // The release scaffold ships placeholder updater keys; asking GitHub for a
    // non-existent manifest on every launch is pointless until they are set.
    if (__UPDATER_CONFIGURED__) void checkForUpdate();
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
  const savedById = useMemo(() => new Map(savedArticles.map((record) => [record.id, record])), [savedArticles]);

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
      setPendingBackup(null);
      setBackupStatus("보관함·방송 준비·소스 설정을 복원했습니다. AI 로그인은 이 PC에서 연결하세요.");
    } catch { setBackupStatus("저장 공간이 부족하거나 저장소에 접근할 수 없어 복원하지 못했습니다. 기존 데이터는 유지됩니다."); }
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

      <nav className="tabs">
        {([["today", "일반 뉴스"], ["community", "커뮤니티·밈"], ["prep", "방송 준비"], ["archive", "보관함"], ["settings", "환경설정"]] as [Tab, string][]).map(([value, label]) => (
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
            ) : visibleCandidates.map((item) => {
              const id = articleId(item.url);
              return (
                <CandidateCard
                  key={item.event_id}
                  item={item}
                  record={savedById.get(id)}
                  running={running}
                  checked={checkedIds.includes(rejectionId(item.url))}
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
          onExport={() => void exportBackup()}
          onImport={() => void importBackup()}
          onRestore={restoreBackup}
          onCancel={() => setPendingBackup(null)}
        />
      )}
      {tab === "settings" && settingsSection === "sources" && <SourcesPanel sources={sources} onChange={setSources} />}
      {tab === "settings" && settingsSection === "rules" && <RulesPanel />}
      {tab === "settings" && settingsSection === "security" && <SecurityPanel />}

      {availableUpdate && (
        <UpdateModal update={availableUpdate} busy={updateBusy} onLater={() => setAvailableUpdate(null)} onInstall={() => void installUpdate()} />
      )}
    </div>
  );
}
