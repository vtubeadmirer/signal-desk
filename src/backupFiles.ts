import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, stat } from "@tauri-apps/plugin-fs";
import { MAX_BACKUP_BYTES } from "./backup";

const filters = [{ name: "Signal Desk 백업", extensions: ["json"] }];

export async function saveBackupFile(raw: string) {
  const path = await save({ title: "Signal Desk 백업 내보내기", defaultPath: `signal-desk-backup-${new Date().toISOString().slice(0, 10)}.json`, filters });
  if (!path) return false;
  await writeTextFile(path, raw);
  return true;
}

export async function readBackupFile(): Promise<string | null> {
  const path = await open({ title: "Signal Desk 백업 불러오기", multiple: false, directory: false, filters });
  if (!path) return null;
  if (Array.isArray(path)) throw new Error("백업 파일 하나를 선택하세요.");
  if ((await stat(path)).size > MAX_BACKUP_BYTES) throw new Error("백업 파일은 4MB 이하여야 합니다.");
  return readTextFile(path);
}
