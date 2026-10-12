import { openUrl } from "@tauri-apps/plugin-opener";
import { CATEGORIES, COMMUNITY_SOURCES, DEFAULT_SOURCES } from "../storage";
import type { DeskBackup } from "../backup";
import type { Source } from "../types";

export type SettingsSection = "sources" | "rules" | "security" | "backup" | "excluded";

export function SettingsNav({ section, onChange }: { section: SettingsSection; onChange: (section: SettingsSection) => void }) {
  const entries: [SettingsSection, string][] = [["sources", "뉴스 소스"], ["rules", "뉴스 선별"], ["excluded", "제외 목록"], ["backup", "백업·복원"], ["security", "보안"]];
  return (
    <div className="content narrow settings-switch">
      <nav className="settings-subtabs">
        {entries.map(([value, label]) => (
          <button key={value} className={section === value ? "active" : ""} onClick={() => onChange(value)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

export function SourcesPanel({ sources, onChange }: { sources: Source[]; onChange: (update: (current: Source[]) => Source[]) => void }) {
  function update(index: number, patch: Partial<Source>) {
    onChange((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  return (
    <main className="content narrow">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">ALLOWED SOURCES</span>
            <h1>뉴스 소스</h1>
            <p>공개되어 있다는 이유만으로 재사용 권한이 생기는 것은 아닙니다. 실제 이용이 허용된 RSS/Atom/공식 피드만 활성화하세요.</p>
          </div>
          <div className="panel-actions">
            <button className="secondary" onClick={() => onChange((current) => [...current, ...COMMUNITY_SOURCES.filter((preset) => !current.some((source) => source.url === preset.url))].slice(0, 50))}>커뮤니티 소스 추가</button>
            <button className="secondary" onClick={() => onChange(() => DEFAULT_SOURCES.map((source) => ({ ...source })))}>기본 소스 복원</button>
            <button className="secondary" onClick={() => onChange((current) => [...current, { name: `새 피드 ${current.length + 1}`, url: "https://", tier: "approved_feed", category: "사회·생활", enabled: false }])}>소스 추가</button>
          </div>
        </div>
        <div className="source-list">
          {sources.map((source, index) => (
            <div className="source-row" key={`${source.name}-${index}`}>
              <input type="checkbox" checked={source.enabled} onChange={(e) => update(index, { enabled: e.target.checked })} aria-label="소스 활성화" />
              <input value={source.name} onChange={(e) => update(index, { name: e.target.value })} aria-label="소스명" />
              <input value={source.url} onChange={(e) => update(index, { url: e.target.value })} aria-label="RSS URL" />
              <select aria-label="수집 방식" value={source.kind ?? "rss"} onChange={(e) => update(index, { kind: e.target.value as Source["kind"] })}><option value="rss">RSS / Atom</option><option value="community">커뮤니티 인기글</option></select>
              <select disabled={source.kind === "community"} value={source.tier} onChange={(e) => update(index, { tier: e.target.value as Source["tier"] })}>
                <option value="official">공식</option>
                <option value="professional">전문매체</option>
                <option value="approved_feed">{source.kind === "community" ? "공개 목록" : "허가 피드"}</option>
              </select>
              <select value={source.category} onChange={(e) => update(index, { category: e.target.value })}>
                {CATEGORIES.slice(1).map((c) => <option key={c}>{c}</option>)}
              </select>
              <button className="danger" onClick={() => onChange((current) => current.filter((_, i) => i !== index))}>삭제</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function RulesPanel() {
  return (
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
  );
}

export function SecurityPanel() {
  return (
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
  );
}

export function BackupPanel({ savedCount, sourceCount, busy, status, pending, onExport, onImport, onRestore, onCancel }: {
  savedCount: number;
  sourceCount: number;
  busy: boolean;
  status: string;
  pending: DeskBackup | null;
  onExport: () => void;
  onImport: () => void;
  onRestore: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="content narrow">
      <section className="panel">
        <h1>백업·복원</h1>
        <p>보관함의 기사·AI 분석·관심 표시·라벨·메모·방송 날짜와 수집 소스·제외 목록·학습 설정을 JSON 파일 하나로 옮깁니다. 다른 PC에도 같은 앱 버전에서 그대로 복원할 수 있습니다.</p>
        <p>현재 보관함 {savedCount}개 · 수집 소스 {sourceCount}개. AI 인증정보는 백업에 포함되지 않습니다.</p>
        <div className="saved-card-actions">
          <button className="primary" disabled={busy} onClick={onExport}>백업 내보내기</button>
          <button className="secondary" disabled={busy} onClick={onImport}>백업 불러오기</button>
        </div>
        <p role="status">{status}</p>
        {pending && <div className="backup-preview">
          <h2>복원할 백업 확인</h2>
          <p>내보낸 시각: {new Date(pending.exportedAt).toLocaleString("ko-KR")}</p>
          <p>기사 {pending.articles.length}개 · 방송 준비 {pending.articles.filter((record) => record.broadcastDates.length > 0).length}개 · 소스 {pending.sources.length}개 · 제외 {pending.rejectedItems?.length ?? 0}개</p>
          <p>복원하면 현재 보관함·소스 설정·제외 목록을 교체합니다. 기존 내용을 보존하려면 먼저 백업 내보내기를 사용하세요.</p>
          <div className="saved-card-actions">
            <button className="primary" disabled={busy} onClick={onRestore}>백업 내용으로 복원</button>
            <button className="secondary" onClick={onCancel}>취소</button>
          </div>
        </div>}
      </section>
    </main>
  );
}
