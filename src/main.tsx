import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadState } from "./persist";
import { sanitizeState } from "./state";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

async function bootstrap() {
  try {
    const loaded = await loadState();
    root.render(
      <React.StrictMode>
        <App initial={loaded.state} migrated={loaded.migrated} />
      </React.StrictMode>,
    );
  } catch (error) {
    // A corrupt or unreadable state file must not brick the app: start empty and say so.
    console.error("[signal-desk] state load failed", error);
    root.render(
      <React.StrictMode>
        <App initial={sanitizeState(null)} migrated={false} loadError="저장된 데이터를 읽지 못했습니다. 백업 파일이 있으면 환경설정 → 백업·복원에서 불러오세요." />
      </React.StrictMode>,
    );
  }
}

void bootstrap();
