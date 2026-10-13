import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { saveMarkdownFile } from "../backupFiles";
import { weeklyRecapMarkdown, weeklyReport, type CollectionEntry } from "../weekly";
import type { ArticleRecord } from "../types";

export function WeeklyTab({ log, records, today, onAddToPrep, goToNews }: {
  log: CollectionEntry[];
  records: ArticleRecord[];
  today: string;
  /** Put a missed story on the selected broadcast date (creates the saved record). */
  onAddToPrep: (entry: CollectionEntry) => void;
  goToNews: () => void;
}) {
  const [status, setStatus] = useState("");
  const report = useMemo(() => weeklyReport(log, records, today), [log, records, today]);
  const empty = !report.runs;

  async function copyRecap() {
    try { await navigator.clipboard.writeText(weeklyRecapMarkdown(report)); setStatus("주간 리캡을 복사했습니다."); }
    catch { setStatus("클립보드를 사용할 수 없습니다. 「파일로 저장」을 이용하세요."); }
  }
  async function saveRecap() {
    try {
      const saved = await saveMarkdownFile(weeklyRecapMarkdown(report), `signal-desk-weekly-${report.to}.md`, "주간 리캡 저장");
      setStatus(saved ? "주간 리캡을 저장했습니다." : "저장을 취소했습니다.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "저장하지 못했습니다."); }
  }

  return (
    <main className="content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">THIS WEEK</span>
          <h1>주간 흐름</h1>
          <p>{report.from} ~ {report.to} · 수집한 날 {report.runs}일 · 방송한 주제 {report.aired.length}건. 매일 「뉴스 가져오기」를 누를 때마다 상위 후보가 기록되고, 여기서 한 주의 흐름이 보입니다.</p>
        </div>
        <div className="prep-actions">
          <button className="secondary" disabled={empty} onClick={() => void copyRecap()}>주간 리캡 복사</button>
          <button className="secondary" disabled={empty} onClick={() => void saveRecap()}>파일로 저장</button>
        </div>
      </section>
      {status && <p className="inline-status" role="status">{status}</p>}
      {empty ? (
        <section className="saved-list">
          <div className="empty-card">
            <strong>아직 이번 주 수집 기록이 없습니다.</strong>
            <span>뉴스나 커뮤니티를 한 번 가져오면 그날부터 기록이 쌓입니다. 사흘쯤 모이면 「계속 올라오는 이야기」가 나타납니다.</span>
            <button className="secondary" onClick={goToNews}>뉴스 가져오러 가기</button>
          </div>
        </section>
      ) : (
        <section className="weekly-grid">
          <div className="panel">
            <h2>계속 올라오는 이야기</h2>
            <p>이번 주 3일 이상 후보에 등장한 이름입니다. 주말 「이번 주 정리」 코너의 뼈대입니다.</p>
            {report.persistent.length ? <ul className="trend-list">{report.persistent.map((t) => <li key={t.term}><strong>{t.term}</strong> <small>{t.days}일 등장{t.lastWeek ? ` · 지난주 ${t.lastWeek}일` : " · 이번 주 새로 등장"}</small><span>{t.titles[0]}</span></li>)}</ul> : <p className="inline-status">아직 3일 이상 반복된 이야기가 없습니다.</p>}
          </div>
          <div className="panel">
            <h2>지난주보다 커진 이야기</h2>
            <p>등장한 날 수가 지난주보다 늘어난 이름입니다.</p>
            {report.risers.length ? <ul className="trend-list">{report.risers.map((t) => <li key={t.term}><strong>{t.term}</strong> <small>{t.lastWeek}일 → {t.thisWeek}일</small><span>{t.titles[0]}</span></li>)}</ul> : <p className="inline-status">비교할 지난주 기록이 쌓이면 표시됩니다.</p>}
          </div>
          <div className="panel">
            <h2>이번 주 처음 나온 이름</h2>
            {report.newcomers.length ? <ul className="trend-list">{report.newcomers.map((t) => <li key={t.term}><strong>{t.term}</strong> <small>{t.days}일</small><span>{t.titles[0]}</span></li>)}</ul> : <p className="inline-status">없음</p>}
          </div>
          <div className="panel">
            <h2>많이 떴는데 안 다룬 것</h2>
            <p>점수가 높거나 워치리스트에 맞았는데 보관함에도 방송 준비에도 없는 후보입니다. 바로 담을 수 있습니다.</p>
            {report.missed.length ? <ul className="missed-list">{report.missed.map((e) => <li key={e.id}>
              <div><strong>{e.title}</strong><small>{e.date} · {e.category} · 점수 {e.score}{e.watch ? " · 워치리스트" : ""}</small></div>
              <div className="saved-card-actions"><button className="link" onClick={() => void openUrl(e.url)}>원문 ↗</button><button className="secondary" onClick={() => onAddToPrep(e)}>방송 준비에 담기</button></div>
            </li>)}</ul> : <p className="inline-status">놓친 후보가 없습니다.</p>}
          </div>
          <div className="panel">
            <h2>이번 주 방송한 주제</h2>
            {report.aired.length ? <ul className="trend-list">{report.aired.map((r) => <li key={r.id}><strong>{r.candidate.title}</strong><small>{r.candidate.source_name} · {r.broadcastDates.filter((d) => d >= report.from && d <= report.to).join(", ")}</small></li>)}</ul> : <p className="inline-status">이번 주 방송 날짜에 담긴 기사가 없습니다.</p>}
            {report.bySource.length ? <p className="inline-status">출처: {report.bySource.map((s) => `${s.source} ${s.count}`).join(" · ")}</p> : null}
          </div>
        </section>
      )}
    </main>
  );
}
