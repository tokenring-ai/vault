import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import fs from "fs-extra";
import { createTempFile } from "./test-utils.ts";

// The machine's real OS secrets manager must never be touched: stand in for one that does not work.
void mock.module("../keychain.ts", () => ({
  resolveVaultPassword: async () => {
    if (process.env.TR_VAULT_PASSWORD) return process.env.TR_VAULT_PASSWORD;
    throw new Error("Vault is required but no password is available.");
  },
  keychainPasswordStore: {
    describe: () => ({ source: "keychain", canUpdate: true }),
    update: async () => {},
    remember: async () => ({ stored: false, reason: "this computer has no secure password store that TokenRing can use" }),
  },
}));

const { default: plugin } = await import("../plugin.ts");
const { VaultService } = await import("../index.ts");

describe("plugin boot with no keychain and no TR_VAULT_PASSWORD", () => {
  let tempDir: string;
  let previousEnv: string | undefined;

  beforeEach(() => {
    previousEnv = process.env.TR_VAULT_PASSWORD;
    delete process.env.TR_VAULT_PASSWORD;
    tempDir = createTempFile();
  });

  afterEach(async () => {
    if (previousEnv === undefined) delete process.env.TR_VAULT_PASSWORD;
    else process.env.TR_VAULT_PASSWORD = previousEnv;
    await fs.remove(tempDir);
  });

  it("boots with the vault not set up, then lets it be created and says the password is needed at every start", async () => {
    const vaultFile = `${tempDir}/test.vault`;
    const app = createTestingApp();
    await plugin.earlyInstall(app, { vault: { vaultFile } });

    const vault = app.requireService(VaultService);
    expect(vault.unlocked).toBe(false);
    expect(vault.vaultFileExists()).toBe(false);
    expect(await fs.pathExists(vaultFile)).toBe(false);

    const created = await vault.createVault("a long enough password");
    expect(created.passwordStored).toBe(false);
    expect(created.message).toContain("every time TokenRing starts");
    expect(vault.unlocked).toBe(true);
    vault.lock();
  });

  it("boots with an existing vault left locked", async () => {
    const vaultFile = `${tempDir}/test.vault`;
    process.env.TR_VAULT_PASSWORD = "an existing password";
    await plugin.earlyInstall(createTestingApp(), { vault: { vaultFile } });
    delete process.env.TR_VAULT_PASSWORD;

    const app = createTestingApp();
    await plugin.earlyInstall(app, { vault: { vaultFile } });
    expect(app.requireService(VaultService).unlocked).toBe(false);
    expect(app.requireService(VaultService).vaultFileExists()).toBe(true);
  });
});
