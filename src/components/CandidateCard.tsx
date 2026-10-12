import { openUrl } from "@tauri-apps/plugin-opener";
import { summaryPreview } from "../storage";
import type { PriorBroadcast } from "../history";
import type { ArticleRecord, Candidate } from "../types";

export function CandidateCard({ item, record, running, checked, focused, watchHits, priorBroadcast, selectedBroadcastDate, labelDraft, onToggleChecked, onReject, onToggleInterest, onToggleBroadcastDate, onLabelDraftChange, onAddLabel, onRemoveLabel }: {
  item: Candidate;
  record: ArticleRecord | undefined;
  running: boolean;
  checked: boolean;
  /** Keyboard cursor (J/K) is on this card. */
  focused: boolean;
  /** Watchlist terms found in the title or summary. */
  watchHits: string[];
  /** A saved story that already went on air and looks like this one. */
  priorBroadcast: PriorBroadcast | null;
  selectedBroadcastDate: string;
  labelDraft: string;
  onToggleChecked: () => void;
  onReject: () => void;
  onToggleInterest: () => void;
  onToggleBroadcastDate: () => void;
  onLabelDraftChange: (value: string) => void;
  onAddLabel: () => void;
  onRemoveLabel: (label: string) => void;
}) {
  const interested = Boolean(record?.interested);
  const scheduled = Boolean(record?.broadcastDates.includes(selectedBroadcastDate));
  return (
    <article className={focused ? "signal-card focused" : "signal-card"} data-candidate-id={item.event_id}>
      <label className="candidate-checkbox"><input type="checkbox" aria-label={`${item.title} 제외 대상으로 선택`} checked={checked} disabled={running} onChange={onToggleChecked} /> 제외할 후보 선택</label>
      <div className="signal-meta">
        <span className="badge">{item.category}</span>
        {item.source_type === "community" && <span className="badge">커뮤니티 화제 · 원문 확인 필요</span>}
        {watchHits.length > 0 && <span className="badge watch" title={watchHits.join(", ")}>워치리스트 · {watchHits[0]}{watchHits.length > 1 ? ` 외 ${watchHits.length - 1}` : ""}</span>}
        {priorBroadcast && <span className="badge aired" title={`${priorBroadcast.reason === "url" ? "같은 링크" : priorBroadcast.reason === "title" ? "같은 제목" : "비슷한 주제"}: ${priorBroadcast.title}`}>이미 방송 {priorBroadcast.date.slice(5).replace("-", "/")}</span>}
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
        <button className="danger" disabled={running} onClick={onReject}>이 글 제외</button>
        <button className={interested ? "secondary selected" : "secondary"} aria-pressed={interested} onClick={onToggleInterest}>
          {interested ? "♥ 관심 저장됨" : "♡ 관심 뉴스"}
        </button>
        <button className={scheduled ? "secondary selected" : "secondary"} aria-pressed={scheduled} onClick={onToggleBroadcastDate}>
          {scheduled ? "방송 준비에서 빼기" : "＋ 방송 준비에 담기"}
        </button>
      </div>
      {record && record.labels.length > 0 && (
        <div className="personal-labels">
          {record.labels.map((label) => (
            <button key={label} title="이 분류 삭제" onClick={() => onRemoveLabel(label)}>
              {label} ×
            </button>
          ))}
        </div>
      )}
      <details className="personalize-details">
        <summary>내 분류 추가</summary>
        <div className="label-editor">
          <input
            value={labelDraft}
            maxLength={40}
            placeholder="예: AI 영상, 밈·커뮤니티"
            aria-label="기사 개인 분류"
            onChange={(event) => onLabelDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddLabel();
              }
            }}
          />
          <button className="secondary" onClick={onAddLabel}>분류 저장</button>
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
  );
}
