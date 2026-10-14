import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { pollText } from "../cuesheet";
import { researchMarkdown, type ResearchView } from "../research";
import type { Candidate } from "../types";

export function ResearchTab({ view, keyword, onKeywordChange, days, onDaysChange, running, status, onRun, watchlist, onAddWatch, isPlanned, onAddToPrep }: {
  view: ResearchView | null;
  keyword: string;
  onKeywordChange: (value: string) => void;
  days: number;
  onDaysChange: (value: number) => void;
  running: boolean;
  status: string;
  onRun: () => void;
  watchlist: string[];
  onAddWatch: (term: string) => void;
  isPlanned: (item: Candidate) => boolean;
  onAddToPrep: (item: Candidate) => void;
}) {
  const [copied, setCopied] = useState("");
  const watched = Boolean(view && watchlist.some((t) => t.toLowerCase() === view.keyword.toLowerCase()));
  async function copy() {
    if (!view) return;
    try { await navigator.clipboard.writeText(researchMarkdown(view)); setCopied("리서치를 복사했습니다."); }
    catch { setCopied("클립보드를 사용할 수 없습니다."); }
  }
  return (
    <main className="content">
      <section className="hero-card">
        <div>
          <span className="eyebrow">KEYWORD RESEARCH</span>
          <h1>키워드 리서치</h1>
          <p>한 가지 사건을 날짜순으로 모아 봅니다. Google 뉴스 검색 피드(로그인·키 없음)와 이 앱이 이미 모은 후보·수집 기록·보관함을 합칩니다. 기사 본문은 가져오지 않습니다.</p>
        </div>
      </section>
      <section className="research-form">
        <input className="archive-search" value={keyword} maxLength={60} placeholder="예: RTX 5090 생산 중단" aria-label="리서치 키워드" onChange={(e) => onKeywordChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onRun(); } }} />
        <select aria-label="기간" value={days} onChange={(e) => onDaysChange(Number(e.target.value))}>
          <option value={7}>최근 7일</option>
          <option value={14}>최근 14일</option>
          <option value={30}>최근 30일</option>
        </select>
        <button className="primary" disabled={running || keyword.trim().length < 2} onClick={onRun}>{running ? "검색 중…" : "모아보기"}</button>
        {view && <button className="secondary" disabled={watched} onClick={() => onAddWatch(view.keyword)}>{watched ? "워치리스트에 있음" : "워치리스트에 추가"}</button>}
        {view && <button className="secondary" disabled={!view.total} onClick={() => void copy()}>리서치 복사</button>}
      </section>
      {(status || copied) && <p className="inline-status" role="status">{copied || status}</p>}
      {view && (
        <section className="research-summary">
          <strong>{view.keyword}</strong> · {view.total}건{view.first ? ` · ${view.first} ~ ${view.last}` : ""}
          {view.sources.length ? <span> · 출처: {view.sources.map((s) => `${s.source} ${s.count}`).join(", ")}</span> : null}
          {view.related.length ? <div className="personal-labels">{view.related.map((r) => <button key={r.term} title={`${r.count}건에 등장 · 누르면 이 단어로 다시 검색`} onClick={() => { onKeywordChange(r.term); }}>{r.term} <small>{r.count}</small></button>)}</div> : null}
        </section>
      )}
      {view && (
        <section className="research-timeline">
          {view.days.map((day) => (
            <div className="research-day" key={day.date}>
              <div className="research-date">{day.date}</div>
              <div className="research-hits">
                {day.hits.map((hit) => (
                  <article className="research-hit" key={hit.key}>
                    <div className="signal-meta">
                      <span className="badge">{hit.origin === "search" ? "뉴스 검색" : hit.origin === "candidate" ? "오늘 후보" : hit.origin === "log" ? "수집 기록" : "보관함"}</span>
                      {hit.source ? <span className="badge">{hit.source}</span> : null}
                      {hit.sourceCount > 1 ? <span className="badge">출처 {hit.sourceCount}</span> : null}
                      {hit.aired?.length ? <span className="badge aired">방송 {hit.aired.join(", ")}</span> : null}
                      {hit.candidate?.talk?.profile ? <span className={`badge profile ${hit.candidate.talk.profile}`}>{hit.candidate.talk.profile === "debate" ? "토론형" : hit.candidate.talk.profile === "empathy" ? "공감형" : "정보형"}</span> : null}
                    </div>
                    <h2>{hit.title}</h2>
                    {hit.candidate?.talk?.questions?.[0] ? <p className="summary">{hit.candidate.talk.questions[0]}</p> : null}
                    {hit.candidate?.talk?.poll ? <p className="poll-row"><span>투표: {pollText(hit.candidate.talk.poll)}</span></p> : null}
                    <div className="card-footer">
                      <span>{hit.url.replace(/^https?:\/\//, "").slice(0, 60)}</span>
                      <div className="saved-card-actions">
                        <button className="link" onClick={() => void openUrl(hit.url)}>원문 보기 ↗</button>
                        {hit.candidate ? <button className={isPlanned(hit.candidate) ? "secondary selected" : "secondary"} onClick={() => onAddToPrep(hit.candidate!)}>{isPlanned(hit.candidate) ? "담김 ✓" : "방송 준비에 담기"}</button> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
          {!view.total && <div className="empty-card"><strong>관련 기사를 찾지 못했습니다.</strong><span>다른 표현으로 검색해 보세요. 영어 제품명은 띄어쓰기를 바꿔보는 것도 효과가 있습니다.</span></div>}
        </section>
      )}
      {!view && !status && (
        <section className="saved-list"><div className="empty-card"><strong>검색어를 넣고 「모아보기」를 누르세요.</strong><span>시청자가 "그 얘기 어떻게 됐어요?" 하고 물었을 때 바로 꺼낼 수 있도록, 사건 하나의 흐름을 정리합니다.</span></div></section>
      )}
    </main>
  );
}
