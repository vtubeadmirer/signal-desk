import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { analyze, collect, health } from "./agent";
import type { ArticleRecord, Candidate, PersonalizationProfile, Source } from "./types";

const STORAGE_KEY = "signal-desk:sources:v1";
const PROVIDER_KEY = "signal-desk:provider:v1";
const ARTICLES_KEY = "signal-desk:articles:v1";

function articleId(url: string): string {
  return url.trim().split("#", 1)[0].replace(/\/+$/, "");
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

const DEFAULT_SOURCES: Source[] = [
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

const CATEGORIES = ["전체", "사회·생활", "버튜버·크리에이터", "IT·플랫폼", "시청자 권리·안전", "게임·인터넷 방송"];

function loadSources(): Source[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Source[]) : DEFAULT_SOURCES;
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
  const [tab, setTab] = useState<"today" | "prep" | "archive" | "settings">("today");
  const [settingsSection, setSettingsSection] = useState<"sources" | "rules" | "security">("sources");
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [provider, setProvider] = useState(localStorage.getItem(PROVIDER_KEY) ?? "codex");
  const [status, setStatus] = useState("준비됨");
  const [providerStatus, setProviderStatus] = useState<{ installed: boolean; authenticated?: boolean; version?: string; auth_hint?: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [savedArticles, setSavedArticles] = useState<ArticleRecord[]>(loadSavedArticles);
  const [selectedBroadcastDate, setSelectedBroadcastDate] = useState(localDateKey);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [archiveQuery, setArchiveQuery] = useState("");
  const [filter, setFilter] = useState("전체");
  const [showMoreCandidates, setShowMoreCandidates] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string>("");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    localStorage.setItem(PROVIDER_KEY, provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(savedArticles));
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
    const list = filter === "전체" ? candidates : candidates.filter((x) => x.category === filter);
    return [...list].sort((a, b) => b.score - a.score).slice(0, 20);
  }, [candidates, filter]);

  const visibleCandidates = showMoreCandidates ? filtered : filtered.slice(0, 10);

  const personalization = useMemo<PersonalizationProfile>(() => {
    const chosen = savedArticles.filter((record) =>
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
  }, [savedArticles]);

  const archiveRecords = useMemo(() => {
    const query = archiveQuery.trim().toLocaleLowerCase();
    return savedArticles
      .filter(isSavedArticle)
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
  }, [savedArticles, archiveQuery]);

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
    setStatus("뉴스 수집 및 1차 압축 중…");
    try {
      const r = await collect(sources.filter((s) => s.enabled), personalization);
      if (!r.ok) throw new Error(r.error ?? "수집 실패");
      const freshCandidates = r.candidates ?? [];
      setCandidates(freshCandidates);
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
      setStatus(`${r.candidates?.length ?? 0}개 후보를 만들었습니다.${r.errors?.length ? ` 수집 실패: ${r.errors.join(" / ")}` : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "수집 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
      await refreshHealth();
    }
  }

  async function runAiAnalysis() {
    if (!candidates.length) return;
    setRunning(true);
    setStatus("상위 후보만 AI 분석 중…");
    try {
      const r = await analyze(candidates.slice(0, 15), provider);
      if (!r.ok) throw new Error(r.error ?? "AI 분석 실패");
      const analyzedById = new Map((r.candidates ?? []).map((item) => [item.event_id, item]));
      setCandidates(candidates.map((item) => ({
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
          <div className="brand">SIGNAL DESK</div>
          <div className="subtitle">오늘 방송에서 이야기할 만한 신호만 압축합니다.</div>
        </div>
        <div className="top-actions">
          <span className={`status-dot ${providerStatus?.authenticated ? "ok" : "warn"}`} />
          <span>{providerStatus?.authenticated ? `Codex ${providerStatus.version ?? "인증됨"}` : providerStatus?.installed ? "Codex 로그인 필요" : "AI 연결 필요"}</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>뉴스</button>
        <button className={tab === "prep" ? "active" : ""} onClick={() => setTab("prep")}>방송 준비</button>
        <button className={tab === "archive" ? "active" : ""} onClick={() => setTab("archive")}>보관함</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>환경설정</button>
      </nav>

      {tab === "today" && (
        <main className="content">
          <section className="hero-card">
            <div>
              <span className="eyebrow">TODAY'S SIGNALS</span>
              <h1>오늘 이야기하기 좋은 것</h1>
              <p>우선 추천 10개를 먼저 보고, 필요하면 추가 후보 10개까지 확인할 수 있습니다.</p>
            </div>
            <div className="hero-actions">
              <button className="primary" disabled={running || sources.every((s) => !s.enabled)} onClick={runCollection}>
                {running ? "처리 중…" : "뉴스 가져오기"}
              </button>
              <button className="secondary" disabled={running || !candidates.length || !providerStatus?.authenticated} onClick={runAiAnalysis}>
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
              {CATEGORIES.map((category) => (
                <button key={category} className={filter === category ? "filter active" : "filter"} onClick={() => { setFilter(category); setShowMoreCandidates(false); }}>{category}</button>
              ))}
            </div>
            <div className="run-info">{lastRun ? `마지막 실행 ${lastRun}` : status}</div>
          </section>

          <section className="signals-grid">
            {filtered.length === 0 ? (
              <div className="empty-card">
                <strong>아직 후보가 없습니다.</strong>
                <span>뉴스 소스에서 허용된 RSS/Atom 피드를 하나 이상 활성화한 뒤 「뉴스 가져오기」를 누르세요.</span>
              </div>
            ) : visibleCandidates.map((item) => (
              <article className="signal-card" key={item.event_id}>
                <div className="signal-meta">
                  <span className="badge">{item.category}</span>
                  <span className={`decision ${item.decision}`}>{item.decision === "candidate" ? "검토 후보" : item.decision === "manual_review" ? "추가 확인" : "제외"}</span>
                </div>
                <h2>{item.title}</h2>
                <p className="summary">
                  {summaryPreview(item.why_now?.trim() || item.summary?.trim())}
                </p>
                <details className="article-details">
                  <summary>RSS에서 수집한 내용 더 보기</summary>
                  <p>{item.summary?.trim() || "이 RSS 피드에는 별도의 본문이나 요약이 제공되지 않았습니다. 원문에서 확인해 주세요."}</p>
                </details>
                <div className="metrics">
                  <span>점수 {item.score}</span>
                  <span>대화성 {item.talkability}</span>
                  <span>검증비용 {item.verification_cost}</span>
                  <span>출처 {item.source_count}</span>
                  {item.personalization_bonus ? <span>관심 주제 +{item.personalization_bonus}</span> : null}
                </div>
                <div className="article-actions">
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
                onClick={() => setShowMoreCandidates((current) => !current)}
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
          <section className="saved-list">
            {savedArticles
              .filter((record) => record.broadcastDates.includes(selectedBroadcastDate))
              .sort((a, b) => a.candidate.score < b.candidate.score ? 1 : -1)
              .map((record) => (
                <article className="saved-card" key={record.id}>
                  <div className="signal-meta">
                    <span className="badge">{record.candidate.category}</span>
                    <span className="decision candidate">점수 {record.candidate.score}</span>
                  </div>
                  <h2>{record.candidate.title}</h2>
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
            {!savedArticles.some((record) => record.broadcastDates.includes(selectedBroadcastDate)) && (
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
          <section className="saved-list">
            {archiveRecords.map((record) => (
              <article className="saved-card" key={record.id}>
                <div className="signal-meta">
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
                <strong>{archiveQuery.trim() ? "검색 결과가 없습니다." : "아직 저장된 기사가 없습니다."}</strong>
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
            <button className={settingsSection === "security" ? "active" : ""} onClick={() => setSettingsSection("security")}>보안</button>
          </nav>
        </div>
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
                  <select value={source.tier} onChange={(e) => updateSource(index, { tier: e.target.value as Source["tier"] })}>
                    <option value="official">공식</option>
                    <option value="professional">전문매체</option>
                    <option value="approved_feed">허가 피드</option>
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
                <strong>일반 정치 뉴스</strong>
                <p>등록된 정치 관련 키워드에 해당하고 업계 직접 관련성이 감지되지 않은 기사는 최하위 점수인 0점을 받습니다.</p>
              </div>
              <div className="rule-item">
                <strong>국가적 비상사태</strong>
                <p>계엄령, 국가 비상사태, 전쟁 발발, 쿠데타 등 등록된 예외 키워드는 일반 정치 뉴스 규칙보다 우선합니다.</p>
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
