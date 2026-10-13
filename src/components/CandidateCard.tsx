import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { summaryPreview } from "../storage";
import { pollText } from "../cuesheet";
import type { PriorBroadcast } from "../history";
import type { ArticleRecord, Candidate } from "../types";

export function CandidateCard({ item, record, running, checked, focused, watchHits, priorBroadcast, persistent, selectedBroadcastDate, labelDraft, onToggleChecked, onReject, onToggleInterest, onToggleBroadcastDate, onLabelDraftChange, onAddLabel, onRemoveLabel }: {
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
  /** A term from this title that kept appearing in collections this week. */
  persistent: { term: string; days: number } | null;
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
  const [copied, setCopied] = useState("");
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(`${label} 복사됨`); }
    catch { setCopied("클립보드를 사용할 수 없습니다"); }
    setTimeout(() => setCopied(""), 1800);
  }
  return (
    <article className={focused ? "signal-card focused" : "signal-card"} data-candidate-id={item.event_id}>
      <label className="candidate-checkbox"><input type="checkbox" aria-label={`${item.title} 제외 대상으로 선택`} checked={checked} disabled={running} onChange={onToggleChecked} /> 제외할 후보 선택</label>
      <div className="signal-meta">
        <span className="badge">{item.category}</span>
        {item.source_type === "community" && <span className="badge">커뮤니티 화제 · 원문 확인 필요</span>}
        {item.talk?.profile && <span className={`badge profile ${item.talk.profile}`}>{item.talk.profile === "debate" ? "토론형" : item.talk.profile === "empathy" ? "공감형" : "정보형"}</span>}
        {priorBroadcast?.reaction && <span className={`badge reaction ${priorBroadcast.reaction}`} title={`${priorBroadcast.date} 방송 반응`}>{priorBroadcast.reaction === "hot" ? "지난번 반응 좋았음" : priorBroadcast.reaction === "flat" ? "지난번 반응 그저 그랬음" : "지난번 안 다룸"}</span>}
        {persistent && <span className="badge persistent" title={`"${persistent.term}"이(가) 이번 주 ${persistent.days}일 동안 후보에 올랐습니다`}>{persistent.days}일째 화제</span>}
        {watchHits.length > 0 && <span className="badge watch" title={watchHits.join(", ")}>워치리스트 · {watchHits[0]}{watchHits.length > 1 ? ` 외 ${watchHits.length - 1}` : ""}</span>}
        {priorBroadcast && (priorBroadcast.followUp
          ? <span className="badge followup" title={`${priorBroadcast.date}에 다룬 이야기의 후속: ${priorBroadcast.title}`}>후속 · {priorBroadcast.date.slice(5).replace("-", "/")} 방송</span>
          : <span className="badge aired" title={`${priorBroadcast.reason === "url" ? "같은 링크" : priorBroadcast.reason === "title" ? "같은 제목" : "비슷한 주제"}: ${priorBroadcast.title}`}>이미 방송 {priorBroadcast.date.slice(5).replace("-", "/")}</span>)}
        <span className={`decision ${item.decision}`}>{item.decision === "candidate" ? "검토 후보" : item.decision === "manual_review" ? "추가 확인" : "제외"}</span>
      </div>
      <h2>{item.title}</h2>
      {item.hook ? <p className="hook">“{item.hook}”</p> : null}
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
      {priorBroadcast?.followUp && priorBroadcast.note ? (
        <details className="article-details">
          <summary>지난 방송 메모 ({priorBroadcast.date})</summary>
          <p>{priorBroadcast.note}</p>
        </details>
      ) : null}
      {(() => {
        const questions = item.chat_questions?.length ? item.chat_questions : item.talk?.questions ?? [];
        const poll = item.poll ?? item.talk?.poll ?? null;
        const fromAi = Boolean(item.chat_questions?.length);
        if (!questions.length && !poll && !item.debate && !item.personal_prompt) return null;
        return (
          <div className="discussion talk">
            <div className="label">채팅에 던질 질문{fromAi ? <span className="talk-intro"> · AI 분석</span> : item.talk?.intro ? <span className="talk-intro"> · {item.talk.intro}</span> : null}</div>
            {questions.length ? <ul>{questions.slice(0, 3).map((question) => <li key={question}>{question}</li>)}</ul> : null}
            {item.debate ? <p className="debate"><strong>찬성 측</strong> {item.debate.pro}<br /><strong>반대 측</strong> {item.debate.con}</p> : null}
            {item.personal_prompt ? <p className="debate"><strong>내 경험</strong> {item.personal_prompt}</p> : null}
            {poll ? (
              <div className="poll-row">
                <span>투표: {pollText(poll)}</span>
                <button className="link" onClick={() => void copy(pollText(poll), "투표 문구")}>복사</button>
              </div>
            ) : null}
            {copied ? <span className="inline-status">{copied}</span> : null}
          </div>
        );
      })()}
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
