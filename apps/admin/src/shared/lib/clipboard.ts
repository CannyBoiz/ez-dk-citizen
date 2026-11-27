// The Admin's clipboard seam. Tests pass a fake; main.tsx passes the browser's clipboard.
export type TextClipboard = Pick<Clipboard, "writeText">;
