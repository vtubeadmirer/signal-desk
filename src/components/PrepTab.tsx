import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { candidateStream, type SavedStream } from "../streams";
import { summaryPreview } from "../storage";
import { buildCueSheet } from "../cuesheet";
import { saveCueSheetFile } from "../backupFiles";
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
  const [cueStatus, setCueStatus] = useState("");
  const planned = savedArticles
    .filter((record) => record.broadcastDates.includes(selectedBroadcastDate) && (savedStream === "all" || candidateStream(record.candidate) === savedStream))
    .sort((a, b) => a.candidate.score < b.candidate.score ? 1 : -1);

  function cueSheet() {
    // The run sheet always covers the whole date, independent of the stream filter.
    return buildCueSheet(savedArticles, selectedBroadcastDate);
  }

  async function copyCueSheet() {
    try {
      await navigator.clipboard.writeText(cueSheet());
      setCueStatus("큐시트를 클립보드에 복사했습니다. 메모 앱이나 방송 소프트웨어에 붙여 넣으세요.");
    } catch {
      setCueStatus("클립보드를 사용할 수 없습니다. 「큐시트 파일로 저장」을 이용하세요.");
    }
  }

  async function saveCueSheet() {
    try {
      const saved = await saveCueSheetFile(cueSheet(), selectedBroadcastDate);
      setCueStatus(saved ? "큐시트를 파일로 저장했습니다." : "저장을 취소했습니다.");
    } catch (error) {
      setCueStatus(error instanceof Error ? error.message : "큐시트를 저장하지 못했습니다.");
    }
  }

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
      <div className="prep-actions">
        <SavedStreamFilter value={savedStream} onChange={onSavedStreamChange} />
        <button className="secondary" disabled={!planned.length} onClick={() => void copyCueSheet()}>큐시트 복사</button>
        <button className="secondary" disabled={!planned.length} onClick={() => void saveCueSheet()}>큐시트 파일로 저장</button>
      </div>
      {cueStatus && <p className="inline-status" role="status">{cueStatus}</p>}
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
