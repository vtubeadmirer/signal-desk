import { preferenceTokens, type NegativeRule } from "../negativePreferences";
import type { LearningSettings, RejectedItem } from "../rejections";
import type { SavedStream } from "../streams";
import { SavedStreamFilter } from "./SavedStreamFilter";

export function ExcludedPanel({ rejectedItems, learning, learnedRules, activeRules, running, learningQuery, onLearningQueryChange, learningStream, onLearningStreamChange, excludedQuery, onExcludedQueryChange, persistLearning, toggleRule, allowRejected }: {
  rejectedItems: RejectedItem[];
  learning: LearningSettings;
  learnedRules: NegativeRule[];
  activeRules: NegativeRule[];
  running: boolean;
  learningQuery: string;
  onLearningQueryChange: (value: string) => void;
  learningStream: SavedStream;
  onLearningStreamChange: (value: SavedStream) => void;
  excludedQuery: string;
  onExcludedQueryChange: (value: string) => void;
  persistLearning: (settings: LearningSettings) => void;
  toggleRule: (rule: NegativeRule) => void;
  allowRejected: (item: RejectedItem) => void;
}) {
  const visibleRules = learnedRules
    .filter((rule) => (learningStream === "all" || rule.stream === learningStream) && rule.label.toLowerCase().includes(learningQuery.toLowerCase()))
    .slice(0, 50);
  const visibleItems = rejectedItems
    .filter((item) => `${item.title} ${item.source_name}`.toLowerCase().includes(excludedQuery.toLowerCase()))
    .slice().reverse().slice(0, 100);

  return (
    <main className="content narrow">
      <section className="panel">
        <h1>제외 목록 ({rejectedItems.length})</h1>
        <section className="learning-panel">
          <h2>제외 성향 학습</h2>
          <label><input type="checkbox" checked={learning.enabled} disabled={running} onChange={(event) => persistLearning({ ...learning, enabled: event.target.checked })} /> 비슷한 새 글에 감점·제외 적용</label>
          <select aria-label="제외 학습 강도" value={learning.mode} disabled={running} onChange={(event) => persistLearning({ ...learning, mode: event.target.value as LearningSettings["mode"] })}>
            <option value="balanced">기본: 주제 또는 핵심 단어 조합이 맞을 때 제외</option>
            <option value="strict">강하게: 구체적인 핵심 단어 하나가 맞아도 제외</option>
          </select>
          <p>지금까지 제외한 제목에서 학습한 규칙 {learnedRules.length}개 · 활성 {activeRules.length}개. 같은 주제를 반복해서 제외할수록 감점이 커집니다. 강하게 일치하면 후보에 넣지 않고, 일부 단어만 겹치면 점수를 낮춥니다.</p>
          <p>일반 뉴스와 커뮤니티 성향은 따로 학습합니다. 대한민국 국가적 비상사태 예외는 추정한 성향으로 숨기지 않으며, 직접 제외한 글은 항상 숨깁니다.</p>
          <details>
            <summary>학습한 주제·핵심 단어 확인 및 수정</summary>
            <input className="archive-search" aria-label="학습 규칙 검색" placeholder="주제·핵심 단어 검색" value={learningQuery} onChange={(event) => onLearningQueryChange(event.target.value)} />
            <SavedStreamFilter value={learningStream} onChange={onLearningStreamChange} label="학습 규칙 종류" className="filters" />
            {visibleRules.map((rule) => <label className="learning-rule" key={rule.id}>
              <input type="checkbox" checked={!learning.mutedRuleIds.includes(rule.id)} disabled={running || !learning.enabled} onChange={() => toggleRule(rule)} />
              <span><strong>{rule.label}</strong><small>{rule.stream === "news" ? "일반 뉴스" : "커뮤니티·밈"} · 제외 이력 {rule.count}회 · 최대 −{rule.weight}점</small></span>
            </label>)}
            <p>검색 결과의 우선순위 50개를 표시합니다. 체크를 해제하면 해당 성향만 적용하지 않습니다. 제목에서 구체적인 주제나 단어 조합을 찾지 못하면 개별 글 제외만 적용됩니다.</p>
          </details>
        </section>
        <p>같은 URL과 동일한 제목의 재게시글을 추천 후보에서 숨깁니다. 보관함에 저장한 메모와 방송 준비 자료는 삭제하지 않습니다. 다시 허용은 직접 제외한 기록을 해제하며, 기본 선별 규칙은 계속 적용됩니다.</p>
        <input className="archive-search" aria-label="제외 목록 검색" value={excludedQuery} placeholder="제목·출처 검색" onChange={(event) => onExcludedQueryChange(event.target.value)} />
        {visibleItems.map((item) => <article className="excluded-row" key={item.id}>
          <div><span className="badge">{item.stream === "news" ? "일반 뉴스" : "커뮤니티·밈"}</span><h2>{item.title}</h2><p>{item.source_name} · {new Date(item.rejectedAt).toLocaleDateString("ko-KR")}</p><p>핵심 단어: {preferenceTokens(item.title).join(", ") || "구체적인 단어 없음"}</p></div>
          <button className="secondary" disabled={running} onClick={() => allowRejected(item)}>다시 허용</button>
        </article>)}
        {!rejectedItems.length && <p>아직 제외한 후보가 없습니다.</p>}
        <p>검색 결과의 최근 100개를 표시합니다. 다시 허용하면 동일한 제목의 제외 항목도 함께 해제됩니다. 다른 제외 글에서 학습한 성향은 남을 수 있으므로 위의 학습 규칙도 확인하세요.</p>
      </section>
    </main>
  );
}
