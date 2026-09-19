import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { analyze, collect, health } from "./agent";
import type { Candidate, Source } from "./types";

const STORAGE_KEY = "signal-desk:sources:v1";
const PROVIDER_KEY = "signal-desk:provider:v1";

const DEFAULT_SOURCES: Source[] = [
  {
    name: "예시 — 공식/허용 피드",
    url: "https://replace-with-approved-feed.example/rss.xml",
    tier: "approved_feed",
    category: "사회·생활",
    enabled: false,
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

export default function App() {
  const [tab, setTab] = useState<"today" | "sources" | "security">("today");
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [provider, setProvider] = useState(localStorage.getItem(PROVIDER_KEY) ?? "codex");
  const [status, setStatus] = useState("준비됨");
  const [providerStatus, setProviderStatus] = useState<{ installed: boolean; authenticated?: boolean; version?: string; auth_hint?: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filter, setFilter] = useState("전체");
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
    return [...list].sort((a, b) => b.score - a.score).slice(0, 10);
  }, [candidates, filter]);

  async function runCollection() {
    setRunning(true);
    setStatus("뉴스 수집 및 1차 압축 중…");
    try {
      const r = await collect(sources.filter((s) => s.enabled));
      if (!r.ok) throw new Error(r.error ?? "수집 실패");
      setCandidates(r.candidates ?? []);
      setLastRun(new Date().toLocaleString("ko-KR"));
      setStatus(`${r.candidates?.length ?? 0}개 후보를 만들었습니다.`);
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
      setCandidates(r.candidates ?? candidates);
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
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>오늘</button>
        <button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}>뉴스 소스</button>
        <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>보안</button>
      </nav>

      {tab === "today" && (
        <main className="content">
          <section className="hero-card">
            <div>
              <span className="eyebrow">TODAY'S SIGNALS</span>
              <h1>오늘 이야기하기 좋은 것</h1>
              <p>뉴스를 많이 보여주는 대신, 사람이 확인할 가치가 있는 후보를 5~10개로 줄이는 구조입니다.</p>
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

          <section className="control-row">
            <div className="filters">
              {CATEGORIES.map((category) => (
                <button key={category} className={filter === category ? "filter active" : "filter"} onClick={() => setFilter(category)}>{category}</button>
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
            ) : filtered.map((item) => (
              <article className="signal-card" key={item.event_id}>
                <div className="signal-meta">
                  <span className="badge">{item.category}</span>
                  <span className={`decision ${item.decision}`}>{item.decision === "candidate" ? "검토 후보" : item.decision === "manual_review" ? "추가 확인" : "제외"}</span>
                </div>
                <h2>{item.title}</h2>
                <p className="summary">{item.why_now ?? item.summary}</p>
                <div className="metrics">
                  <span>점수 {item.score}</span>
                  <span>대화성 {item.talkability}</span>
                  <span>검증비용 {item.verification_cost}</span>
                  <span>출처 {item.source_count}</span>
                </div>
                {item.discussion_points?.length ? (
                  <div className="discussion">
                    <div className="label">얘기할 포인트</div>
                    <ul>{item.discussion_points.slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul>
                  </div>
                ) : null}
                <div className="card-footer">
                  <span>{item.source_name}</span>
                  <button className="link" onClick={() => void openUrl(item.url)}>원문 보기 ↗</button>
                </div>
              </article>
            ))}
          </section>
        </main>
      )}

      {tab === "sources" && (
        <main className="content narrow">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">ALLOWED SOURCES</span>
                <h1>뉴스 소스</h1>
                <p>공개되어 있다는 이유만으로 재사용 권한이 생기는 것은 아닙니다. 실제 이용이 허용된 RSS/Atom/공식 피드만 활성화하세요.</p>
              </div>
              <button className="secondary" onClick={addSource}>소스 추가</button>
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

      {tab === "security" && (
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
