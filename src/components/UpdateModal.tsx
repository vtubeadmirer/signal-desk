import type { Update } from "@tauri-apps/plugin-updater";

export function UpdateModal({ update, busy, onLater, onInstall }: { update: Update; busy: boolean; onLater: () => void; onInstall: () => void }) {
  return (
    <div className="update-modal-backdrop" role="dialog" aria-modal="true">
      <div className="update-modal">
        <span className="eyebrow">SIGNAL DESK UPDATE</span>
        <h2>새 버전이 있습니다</h2>
        <p>현재 버전보다 새로운 서명된 업데이트가 발견되었습니다. 업데이트 파일은 Tauri updater 서명 검증을 통과한 경우에만 설치됩니다.</p>
        <div className="update-version">새 버전 {update.version}</div>
        {update.body ? <pre>{update.body}</pre> : null}
        <div className="update-actions">
          <button className="secondary" onClick={onLater} disabled={busy}>나중에</button>
          <button className="primary" onClick={onInstall} disabled={busy}>{busy ? "업데이트 중…" : "업데이트"}</button>
        </div>
      </div>
    </div>
  );
}
