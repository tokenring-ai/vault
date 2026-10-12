import { beforeEach, describe, expect, it, mock } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ViewDefinition } from "@tokenring-ai/one-frontend/dock/types.ts";
import { createFakeDashboardApi, createFakePanelHandle, renderView } from "@tokenring-ai/one-frontend/test/dock.tsx";
import type React from "react";

const setItems = mock(async (_args: { updates: { category: string; key: string; value: string }[] }) => ({
  success: true,
  message: "ok",
}));
const deleteItems = mock(async (_args: { updates: { category: string; key: string }[] }) => ({
  success: true,
  message: "ok",
}));
const getItem = mock(async (_args: { category: string; key: string }) => ({
  found: true,
  value: "super-secret",
}));
const mutateVault = mock(async () => undefined);
const moveItem = mock(async (_args: { from: { category: string; key: string }; to: { category: string; key: string }; overwrite?: boolean }) => ({
  success: true,
  message: "ok",
}));
const createCategory = mock(async (_args: { category: string }) => ({ success: true, message: "ok" }));
const lock = mock(async (_args: Record<string, never>) => ({ success: true, message: "Vault locked" }));
const unlock = mock(async (_args: { password?: string }) => ({ success: true, message: "Vault unlocked" }));
const changePassword = mock(async (_args: { currentPassword: string; newPassword: string }) => ({ success: true, message: "ok" }));
const mutateStatus = mock(async () => undefined);

let vaultStatus: { unlocked: boolean; passwordSource: string; canChangePassword: boolean; reason?: string } = {
  unlocked: true,
  passwordSource: "keychain",
  canChangePassword: true,
};

let vaultData: Record<string, string[]> = {
  env: ["API_KEY", "DATABASE_URL"],
  token: ["github"],
};

void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  useVaultKeys: () => ({
    data: vaultData,
    isLoading: false,
    isValidating: false,
    error: undefined,
    mutate: mutateVault,
  }),
  vaultRPCClient: {
    setItems,
    deleteItems,
    getItem,
    moveItem,
    createCategory,
    lock,
    unlock,
    changePassword,
  },
}));

void mock.module("../lib/vaultStatus.ts", () => ({
  useVaultStatus: () => ({ data: vaultStatus, isLoading: false, isValidating: false, error: undefined, mutate: mutateStatus }),
  assertMutationOk: (result: { success: boolean; message: string }, fallback: string) => {
    if (!result.success) throw new Error(result.message || fallback);
  },
}));

const scheduleClipboardClear = mock((_text: string, _delay?: number) => {});
void mock.module("../lib/clipboardAutoClear.ts", () => ({ CLIPBOARD_CLEAR_MS: 30_000, scheduleClipboardClear, cancelClipboardClear: () => {} }));

// focus-trap refuses to activate in jsdom.
const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

void mock.module("@tokenring-ai/one-frontend/components/ui/toast.tsx", () => ({
  toastManager: {
    success: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    warning: mock(() => {}),
  },
}));

const { default: contribution } = await import("../app.tsx");
const vaultView = contribution.views.find(view => view.id === "vault-vault") as ViewDefinition<any>;
const getView = (id: string) => contribution.views.find(view => view.id === id);

/** Mounts the vault view the way the dock does, on the Vault dashboard. */
async function renderVault() {
  const result = renderView(
    vaultView,
    {},
    {
      api: createFakeDashboardApi({ dashboardId: "vault", getView }),
      panel: createFakePanelHandle({ viewId: "vault-vault", dashboardId: "vault" }),
      path: "/vault",
      routes: ["/vault"],
    },
  );
  // The view ships as a lazy chunk: wait for it to load before the test asserts.
  await screen.findByText("Vault");
  return result;
}

describe("VaultView", () => {
  beforeEach(() => {
    setItems.mockClear();
    deleteItems.mockClear();
    getItem.mockClear();
    mutateVault.mockClear();
    for (const fn of [moveItem, createCategory, lock, unlock, changePassword, mutateStatus, scheduleClipboardClear]) fn.mockClear();
    vaultStatus = { unlocked: true, passwordSource: "keychain", canChangePassword: true };
    vaultData = {
      env: ["API_KEY", "DATABASE_URL"],
      token: ["github"],
    };
  });

  it("lists secrets from the vault stream", async () => {
    await renderVault();
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
    expect(screen.getByText("DATABASE_URL")).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    // Category label appears in both tab bar and section heading
    expect(screen.getAllByText("Environment Variables").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Stored Auth Tokens").length).toBeGreaterThanOrEqual(1);
  });

  it("filters keys by search", async () => {
    const user = userEvent.setup();
    await renderVault();
    await user.type(screen.getByLabelText("Search vault keys"), "api");
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
    expect(screen.queryByText("DATABASE_URL")).not.toBeInTheDocument();
    expect(screen.queryByText("github")).not.toBeInTheDocument();
  });

  it("reveals a secret value via getItem", async () => {
    const user = userEvent.setup();
    await renderVault();

    const row = screen.getByText("API_KEY").closest("div.flex.flex-col") ?? screen.getByText("API_KEY").parentElement!.parentElement!;
    const showBtn = within(row as HTMLElement).getByTitle("Show value");
    await user.click(showBtn);

    await waitFor(() => {
      expect(getItem).toHaveBeenCalledWith({ category: "env", key: "API_KEY" });
    });
    await waitFor(() => {
      expect(screen.getByText("super-secret")).toBeInTheDocument();
    });

    // Hide should clear the value from the DOM
    await user.click(within(row as HTMLElement).getByTitle("Hide value"));
    expect(screen.queryByText("super-secret")).not.toBeInTheDocument();
  });

  it("copies a secret without forcing reveal", async () => {
    const user = userEvent.setup();
    const writeText = mock(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await renderVault();

    const row = screen.getByText("API_KEY").closest("div.flex.flex-col") ?? screen.getByText("API_KEY").parentElement!.parentElement!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Copy value" }));

    await waitFor(() => {
      expect(getItem).toHaveBeenCalledWith({ category: "env", key: "API_KEY" });
    });
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("super-secret");
    });
    // Copy must not leave the secret visible on screen
    expect(screen.queryByText("super-secret")).not.toBeInTheDocument();
    // ...and the clipboard is scheduled to be wiped.
    expect(scheduleClipboardClear).toHaveBeenCalledWith("super-secret", 30_000);
  });

  it("adds a new key via setItems", async () => {
    const user = userEvent.setup();
    await renderVault();

    const addButtons = screen.getAllByText("Add new key");
    await user.click(addButtons[0]!);

    await user.type(screen.getByPlaceholderText("Key name"), "NEW_KEY");
    await user.type(screen.getByPlaceholderText("Value"), "new-value");
    await user.click(screen.getByTitle("Save"));

    await waitFor(() => {
      expect(setItems).toHaveBeenCalledWith({
        updates: [{ category: "env", key: "NEW_KEY", value: "new-value" }],
      });
    });
    expect(mutateVault).toHaveBeenCalled();
  });

  it("clears add-form fields on cancel so secrets do not linger", async () => {
    const user = userEvent.setup();
    await renderVault();

    const addButtons = screen.getAllByText("Add new key");
    await user.click(addButtons[0]!);

    await user.type(screen.getByPlaceholderText("Key name"), "TEMP_KEY");
    await user.type(screen.getByPlaceholderText("Value"), "temp-secret");
    await user.click(screen.getByLabelText("Cancel"));

    // Form closed
    expect(screen.queryByPlaceholderText("Key name")).not.toBeInTheDocument();

    // Re-open — previous secret must not reappear
    await user.click(screen.getAllByText("Add new key")[0]!);
    expect(screen.getByPlaceholderText("Key name")).toHaveValue("");
    expect(screen.getByPlaceholderText("Value")).toHaveValue("");
  });

  it("deletes a key after confirmation", async () => {
    const user = userEvent.setup();
    await renderVault();

    const row = screen.getByText("API_KEY").closest("div.flex.flex-col") ?? screen.getByText("API_KEY").parentElement!.parentElement!;
    await user.click(within(row as HTMLElement).getByTitle("Delete key"));
    await user.click(within(row as HTMLElement).getByText("Yes"));

    await waitFor(() => {
      expect(deleteItems).toHaveBeenCalledWith({
        updates: [{ category: "env", key: "API_KEY" }],
      });
    });
    expect(mutateVault).toHaveBeenCalled();
  });

  it("opens bulk import and imports KEY=value pairs", async () => {
    const user = userEvent.setup();
    await renderVault();

    const importButtons = screen.getAllByText("Import");
    await user.click(importButtons[0]!);

    expect(screen.getByText("Bulk Import")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/API_KEY=abc123/);
    await user.clear(textarea);
    await user.type(textarea, "FOO=bar\nBAZ=qux");

    expect(screen.getByText("2 keys detected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Import 2 keys/i }));

    await waitFor(() => {
      expect(setItems).toHaveBeenCalledWith({
        updates: [
          { category: "env", key: "FOO", value: "bar" },
          { category: "env", key: "BAZ", value: "qux" },
        ],
      });
    });
  });

  it("names the key in the delete confirmation", async () => {
    const user = userEvent.setup();
    await renderVault();

    const row = screen.getByText("API_KEY").closest("div.flex.flex-col") ?? screen.getByText("API_KEY").parentElement!.parentElement!;
    await user.click(within(row as HTMLElement).getByTitle("Delete key"));
    expect(within(row as HTMLElement).getByTitle("Delete API_KEY?")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("button", { name: "Confirm delete API_KEY" })).toBeInTheDocument();
  });

  it("warns before the add form overwrites an existing key", async () => {
    const user = userEvent.setup();
    await renderVault();

    await user.click(screen.getAllByText("Add new key")[0]!);
    await user.type(screen.getByPlaceholderText("Key name"), "API_KEY");
    expect(screen.getByText(/already exists\. Saving will overwrite/)).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Key name"));
    await user.type(screen.getByPlaceholderText("Key name"), "OTHER");
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
  });

  it("warns how many existing keys a bulk import will overwrite", async () => {
    const user = userEvent.setup();
    await renderVault();

    await user.click(screen.getAllByText("Import")[0]!);
    const textarea = screen.getByPlaceholderText(/API_KEY=abc123/);
    await user.type(textarea, "API_KEY=new\nDATABASE_URL=x\nFRESH=y");
    expect(screen.getByText("Will overwrite 2 existing keys in Environment Variables.")).toBeInTheDocument();
    expect(screen.getAllByText("overwrites")).toHaveLength(2);
  });

  it("explains the vault when it is empty and links to configuration", async () => {
    vaultData = {};
    await renderVault();

    expect(screen.getByText("Your vault is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configuration" })).toHaveAttribute("href", "/configuration");
    expect(screen.queryByText("No vault categories")).not.toBeInTheDocument();
  });

  it("hides the empty-vault explainer once keys exist", async () => {
    await renderVault();
    expect(screen.queryByTestId("vault-intro")).not.toBeInTheDocument();
  });

  it("shows dynamic categories from vault data", async () => {
    vaultData = {
      env: ["X"],
      custom: ["my-secret"],
    };
    await renderVault();
    expect(screen.getAllByText("custom").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("my-secret")).toBeInTheDocument();
  });

  it("renames a key in place", async () => {
    const user = userEvent.setup();
    await renderVault();

    await user.click(screen.getByRole("button", { name: "Rename or move API_KEY" }));
    const name = screen.getByLabelText("Key name");
    await user.clear(name);
    await user.type(name, "OPENAI_KEY");
    await user.click(screen.getByRole("button", { name: "Apply rename or move" }));

    await waitFor(() =>
      expect(moveItem).toHaveBeenCalledWith({ from: { category: "env", key: "API_KEY" }, to: { category: "env", key: "OPENAI_KEY" }, overwrite: false }),
    );
    expect(mutateVault).toHaveBeenCalled();
  });

  it("moves a key to another category, confirming before it overwrites", async () => {
    const user = userEvent.setup();
    vaultData = { env: ["API_KEY", "github"], token: ["github"] };
    await renderVault();

    const rows = screen.getAllByRole("button", { name: "Rename or move github" });
    await user.click(rows[0]!);
    await user.selectOptions(screen.getByLabelText("Category"), "token");
    await user.click(screen.getByRole("button", { name: "Apply rename or move" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/already exists in Stored Auth Tokens/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Overwrite" }));

    await waitFor(() =>
      expect(moveItem).toHaveBeenCalledWith({ from: { category: "env", key: "github" }, to: { category: "token", key: "github" }, overwrite: true }),
    );
  });

  it("creates a category and selects it", async () => {
    const user = userEvent.setup();
    await renderVault();

    await user.click(screen.getByRole("button", { name: /New category/ }));
    await user.type(screen.getByLabelText("Category name"), "database");
    await user.click(screen.getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({ category: "database" }));
  });

  it("locks the vault from the header", async () => {
    const user = userEvent.setup();
    await renderVault();

    await user.click(screen.getByRole("button", { name: "Lock now" }));
    await waitFor(() => expect(lock).toHaveBeenCalledTimes(1));
    expect(mutateStatus).toHaveBeenCalled();
  });

  it("shows the locked state and unlocks from it", async () => {
    const user = userEvent.setup();
    vaultStatus = { unlocked: false, passwordSource: "keychain", canChangePassword: true };
    vaultData = {};
    await renderVault();

    expect(screen.getByTestId("vault-locked")).toBeInTheDocument();
    expect(screen.queryByText("Add new key")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lock now" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unlock with saved password" }));
    await waitFor(() => expect(unlock).toHaveBeenCalledWith({}));

    await user.type(screen.getByLabelText("Vault password"), "typed-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(unlock).toHaveBeenCalledWith({ password: "typed-password" }));
  });

  it("changes the master password only after matching entries and an acknowledgement", async () => {
    const user = userEvent.setup();
    await renderVault();

    await user.click(screen.getByRole("button", { name: "Change master password" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Change password" });

    await user.type(within(dialog).getByLabelText("Current password"), "old-password");
    await user.type(within(dialog).getByLabelText("New password"), "new-password-1");
    await user.type(within(dialog).getByLabelText("Repeat new password"), "new-password-2");
    expect(within(dialog).getByText("The passwords do not match")).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    await user.clear(within(dialog).getByLabelText("Repeat new password"));
    await user.type(within(dialog).getByLabelText("Repeat new password"), "new-password-1");
    // Still disabled until the user acknowledges that a lost password loses every secret.
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText(/cannot be recovered/));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ currentPassword: "old-password", newPassword: "new-password-1" }));
  });

  it("disables changing the password when the server cannot persist it", async () => {
    vaultStatus = { unlocked: true, passwordSource: "environment", canChangePassword: false, reason: "Set by TR_VAULT_PASSWORD" };
    await renderVault();
    const button = screen.getByRole("button", { name: "Change master password" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Set by TR_VAULT_PASSWORD");
  });
});
