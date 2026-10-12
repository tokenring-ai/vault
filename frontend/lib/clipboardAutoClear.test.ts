import { afterEach, describe, expect, it, mock } from "bun:test";
import { cancelClipboardClear, scheduleClipboardClear } from "./clipboardAutoClear.ts";

function installClipboard(initial: string) {
  const state = { text: initial };
  const writeText = mock(async (text: string) => {
    state.text = text;
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: async () => state.text, writeText },
  });
  return { state, writeText };
}

const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("scheduleClipboardClear", () => {
  afterEach(cancelClipboardClear);

  it("wipes the clipboard when it still holds the secret", async () => {
    const { state } = installClipboard("secret");
    scheduleClipboardClear("secret", 5);
    await tick(30);
    expect(state.text).toBe("");
  });

  it("leaves something the user copied since alone", async () => {
    const { state, writeText } = installClipboard("secret");
    scheduleClipboardClear("secret", 5);
    state.text = "something else";
    await tick(30);
    expect(state.text).toBe("something else");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("a newer copy replaces the pending clear", async () => {
    const { state } = installClipboard("second");
    scheduleClipboardClear("first", 5);
    scheduleClipboardClear("second", 60_000);
    await tick(30);
    expect(state.text).toBe("second");
  });
});
