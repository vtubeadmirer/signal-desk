import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { briefingMarkdown, replacePick, type Briefing } from "../briefing";
import { pollText, segmentOf } from "../cuesheet";
import { summaryPreview } from "../storage";
import type { Candidate } from "../types";

export function BriefingTab({ briefing, onBriefingChange, date, running, hasCandidates, onAddAll, onAddOne, isPlanned, onRunRoutine, goToPrep, goToNews }: {
  briefing: Briefing;
  onBriefingChange: (next: Briefing) => void;
  date: string;
  running: boolean;
  hasCandidates: boolean;
  onAddAll: (items: Candidate[]) => void;
  onAddOne: (item: Candidate) => void;
  isPlanned: (item: Candidate) => boolean;
  onRunRoutine: () => void;
  goToPrep: () => void;
  goToNews: () => void;
}) {
  const [status, setStatus] = useState("");
  async function copyBriefing() {
    try { await navigator.clipboard.writeText(briefingMarkdown(briefing, date)); setStatus("브리핑을 복사했습니다."); }
    catch { setStatus("클립보드를 사용할 수 없습니다."); }
  }
  const allPlanned = briefing.picks.length > 0 && briefing.picks.every((p) => isPlanned(p.item));

  return (
    <main className="content">
      <section className="hero-card">
        <div>
          <span className="eyebrow">TODAY’S TALK</span>
          <h1>오늘의 토크 {briefing.quota}</h1>
          <p>후보 전체에서 오늘 바로 꺼낼 {briefing.quota}개를 고릅니다. 워치리스트 → 지난 방송 후속 → 커뮤니티 1개 이상 → 점수 순이며, 같은 카테고리는 2개까지, 이미 방송한 이야기는 뺍니다. 숫자키 1~{briefing.quota}로 원문을 엽니다.</p>
        </div>
        <div className="hero-actions">
          <button className="primary" disabled={running} onClick={onRunRoutine} title="뉴스 → 커뮤니티 수집 후 오늘의 토크를 다시 고릅니다">{running ? "처리 중…" : "방송 전 루틴 실행"}</button>
          <button className="secondary" disabled={!briefing.picks.length || allPlanned} onClick={() => onAddAll(briefing.picks.map((p) => p.item))}>{allPlanned ? "모두 담김" : `${briefing.picks.length}개 모두 방송 준비에 담기`}</button>
          <button className="secondary" disabled={!briefing.picks.length} onClick={() => void copyBriefing()}>브리핑 복사</button>
        </div>
      </section>
      {status && <p className="inline-status" role="status">{status}</p>}
      {!briefing.picks.length ? (
        <section className="saved-list">
          <div className="empty-card">
            <strong>{hasCandidates ? "오늘 고를 수 있는 후보가 없습니다." : "아직 후보가 없습니다."}</strong>
            <span>{hasCandidates ? "제외 목록이나 이미 방송한 이야기를 빼고 나면 남는 게 없습니다. 뉴스를 다시 가져오세요." : "「방송 전 루틴 실행」을 누르면 뉴스와 커뮤니티를 차례로 가져온 뒤 오늘의 토크를 고릅니다."}</span>
            <button className="secondary" onClick={goToNews}>뉴스 탭으로</button>
          </div>
        </section>
      ) : (
        <section className="briefing-list">
          {briefing.picks.map((pick, index) => {
            const item = pick.item;
            const questions = item.chat_questions?.length ? item.chat_questions : item.talk?.questions ?? [];
            const poll = item.poll ?? item.talk?.poll;
            return (
              <article className="briefing-card" key={item.event_id}>
                <div className="briefing-number">{index + 1}</div>
                <div className="briefing-body">
                  <div className="signal-meta">
                    <span className="badge">{segmentOf(item)}</span>
                    <span className="badge">{item.category}</span>
                    <span className="badge watch">{pick.reason}</span>
                    {pick.prior && <span className="badge followup">이어서 · {pick.prior.date.slice(5).replace("-", "/")}</span>}
                  </div>
                  <h2>{item.title}</h2>
                  <p className="summary">{summaryPreview(item.why_now?.trim() || item.summary)}</p>
                  {questions.length ? <ul className="briefing-questions">{questions.slice(0, 2).map((q) => <li key={q}>{q}</li>)}</ul> : null}
                  {poll ? <p className="poll-row"><span>투표: {pollText(poll)}</span></p> : null}
                  <div className="card-footer">
                    <span>{item.source_name}</span>
                    <div className="saved-card-actions">
                      <button className="link" onClick={() => void openUrl(item.url)}>원문 보기 ↗</button>
                      <button className="secondary" disabled={!briefing.alternates.length} onClick={() => onBriefingChange(replacePick(briefing, item.event_id))}>교체</button>
                      <button className={isPlanned(item) ? "secondary selected" : "secondary"} onClick={() => onAddOne(item)}>{isPlanned(item) ? "담김 ✓" : "방송 준비에 담기"}</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="candidate-expand">
            <button className="secondary" onClick={goToPrep}>방송 준비 탭 열기</button>
          </div>
        </section>
      )}
    </main>
  );
}
