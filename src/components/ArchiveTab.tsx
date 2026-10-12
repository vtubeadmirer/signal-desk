import { openUrl } from "@tauri-apps/plugin-opener";
import { candidateStream, type SavedStream } from "../streams";
import { summaryPreview } from "../storage";
import type { ArticleRecord } from "../types";
import { SavedStreamFilter } from "./SavedStreamFilter";

export function ArchiveTab({ records, archiveQuery, onQueryChange, savedStream, onSavedStreamChange, selectedBroadcastDate, updateRecord, removeLabel, removeRecord, goToNews, goToPrep }: {
  records: ArticleRecord[];
  archiveQuery: string;
  onQueryChange: (value: string) => void;
  savedStream: SavedStream;
  onSavedStreamChange: (value: SavedStream) => void;
  selectedBroadcastDate: string;
  updateRecord: (id: string, change: (record: ArticleRecord) => ArticleRecord) => void;
  removeLabel: (id: string, label: string) => void;
  removeRecord: (id: string) => void;
  goToNews: () => void;
  goToPrep: () => void;
}) {
  return (
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
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </section>
      <SavedStreamFilter value={savedStream} onChange={onSavedStreamChange} />
      <section className="saved-list">
        {records.map((record) => (
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
                <button className="link" onClick={() => void openUrl(record.candidate.url)}>원문 보기 ↗</button>
                <button
                  className="secondary"
                  onClick={() => {
                    updateRecord(record.id, (current) => ({
                      ...current,
                      broadcastDates: current.broadcastDates.includes(selectedBroadcastDate)
                        ? current.broadcastDates
                        : [...current.broadcastDates, selectedBroadcastDate].sort(),
                    }));
                    goToPrep();
                  }}
                >
                  방송 준비에 담기
                </button>
                <button className="danger" onClick={() => removeRecord(record.id)}>보관함에서 제거</button>
              </div>
            </div>
          </article>
        ))}
        {records.length === 0 && (
          <div className="empty-card">
            <strong>{archiveQuery.trim() ? "검색 결과가 없습니다." : "현재 조건에 맞는 저장 자료가 없습니다."}</strong>
            <span>뉴스 화면에서 관심 뉴스, 방송 준비 또는 개인 분류를 이용해 기사를 저장하세요.</span>
            {!archiveQuery.trim() && <button className="secondary" onClick={goToNews}>뉴스 보러 가기</button>}
          </div>
        )}
      </section>
    </main>
  );
}
