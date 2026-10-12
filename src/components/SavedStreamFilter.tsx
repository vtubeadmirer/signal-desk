import type { SavedStream } from "../streams";

const OPTIONS: SavedStream[] = ["all", "news", "community"];

export function streamLabel(value: SavedStream): string {
  return value === "all" ? "전체" : value === "news" ? "일반 뉴스" : "커뮤니티·밈";
}

export function SavedStreamFilter({ value, onChange, label = "저장 자료 종류", className = "filters saved-stream-filter" }: {
  value: SavedStream;
  onChange: (value: SavedStream) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={className} aria-label={label}>
      {OPTIONS.map((option) => (
        <button key={option} className={value === option ? "filter active" : "filter"} aria-pressed={value === option} onClick={() => onChange(option)}>
          {streamLabel(option)}
        </button>
      ))}
    </div>
  );
}
