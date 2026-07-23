export const HISTORY_NOTE_PREVIEW_MAX_LINES = 3;
export const HISTORY_NOTE_PREVIEW_MAX_CHARS = 200;

export function historyNotePreview(bodyMarkdown: string): string | null {
  let text = bodyMarkdown.replace(/\r\n/g, "\n");
  text = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, HISTORY_NOTE_PREVIEW_MAX_LINES);
  if (!lines.length) return null;
  let joined = lines.join("\n");
  if (joined.length > HISTORY_NOTE_PREVIEW_MAX_CHARS) {
    joined = `${joined.slice(0, HISTORY_NOTE_PREVIEW_MAX_CHARS)}…`;
  }
  return joined;
}
