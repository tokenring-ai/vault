/** How long a copied secret stays on the clipboard. */
export const CLIPBOARD_CLEAR_MS = 30_000;

let pending: { timer: ReturnType<typeof setTimeout>; text: string } | null = null;

function clipboard(): Clipboard | undefined {
  return (navigator as { clipboard?: Clipboard }).clipboard;
}

/**
 * Clears the clipboard after `delayMs` — but only if it still holds `text`, so whatever the
 * user copied since is left alone. When the browser will not let us read the clipboard back
 * (no permission, page not focused), it is left untouched rather than blindly overwritten.
 * A newer copy replaces the pending clear.
 */
export function scheduleClipboardClear(text: string, delayMs: number = CLIPBOARD_CLEAR_MS): void {
  cancelClipboardClear();
  const timer = setTimeout(() => {
    pending = null;
    const api = clipboard();
    if (!api?.readText) return;
    void api
      .readText()
      .then(current => (current === text ? api.writeText("") : undefined))
      .catch(() => {});
  }, delayMs);
  pending = { timer, text };
}

export function cancelClipboardClear(): void {
  if (pending) clearTimeout(pending.timer);
  pending = null;
}
