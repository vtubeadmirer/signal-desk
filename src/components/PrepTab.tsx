import { openUrl } from "@tauri-apps/plugin-opener";
import { candidateStream, type SavedStream } from "../streams";
import { summaryPreview } from "../storage";
import type { ArticleRecord } from "../types";
import { SavedStreamFilter } from "./SavedStreamFilter";

export function PrepTab({ savedArticles, selectedBroadcastDate, onDateChange, savedStream, onSavedStreamChange, updateRecord, removeLabel, goToNews }: {
  savedArticles: ArticleRecord[];
  selectedBroadcastDate: string;
  onDateChange: (value: string) => void;
  savedStream: SavedStream;
  onSavedStreamChange: (value: SavedStream) => void;
  updateRecord: (id: string, change: (record: ArticleRecord) => ArticleRecord) => void;
  removeLabel: (id: string, label: string) => void;
  goToNews: () => void;
}) {
  const planned = savedArticles
    .filter((record) => record.broadcastDates.includes(selectedBroadcastDate) && (savedStream === "all" || candidateStream(record.candidate) === savedStream))
    .sort((a, b) => a.candidate.score < b.candidate.score ? 1 : -1);

  return (
    <main className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">STREAM PLAN</span>
          <h1>방송 준비</h1>
          <p>방송 날짜별로 기사를 모으고 메모를 남기세요. 같은 기사를 여러 방송 날짜에 담을 수도 있습니다.</p>
        </div>
        <label className="date-control">
          방송 날짜
          <input className="date-input" type="date" value={selectedBroadcastDate} onChange={(event) => onDateChange(event.target.value)} />
        </label>
      </section>
      <SavedStreamFilter value={savedStream} onChange={onSavedStreamChange} />
      <section className="saved-list">
        {planned.map((record) => (
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
                onChange={(event) => updateRecord(record.id, (current) => ({ ...current, note: event.target.value }))}
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
        {planned.length === 0 && (
          <div className="empty-card">
            <strong>이 날짜에 준비한 기사가 없습니다.</strong>
            <span>뉴스 화면에서 방송 날짜를 선택한 뒤 「방송 준비에 담기」를 눌러 보세요.</span>
            <button className="secondary" onClick={goToNews}>뉴스 보러 가기</button>
          </div>
        )}
      </section>
    </main>
  );
}
