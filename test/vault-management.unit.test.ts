import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import createLocalRPCClient from "@tokenring-ai/rpc/createLocalRPCClient";
import fs from "fs-extra";
import type VaultRpcSchema from "../rpc/schema.ts";
import vaultRPC from "../rpc/vault.ts";
import VaultService, { type VaultPasswordStore } from "../VaultService.ts";
import { readVault, writeVault } from "../vault.ts";
import { createTempFile } from "./test-utils.ts";

function fakeStore(initial: string, options: { canUpdate?: boolean; failUpdate?: boolean } = {}) {
  const store = {
    stored: initial,
    updates: [] as Array<[string, string]>,
    describe: () => ({ source: "keychain", canUpdate: options.canUpdate ?? true, ...(options.canUpdate === false && { reason: "env" }) }),
    async update(current: string, next: string) {
      if (options.failUpdate) throw new Error("keychain unavailable");
      store.updates.push([current, next]);
      if (store.stored === current) store.stored = next;
    },
  } satisfies VaultPasswordStore & { stored: string; updates: Array<[string, string]> };
  return store;
}

describe("vault management", () => {
  let tempDir: string;
  let vaultFile: string;
  let vault: VaultService;
  let app: TokenRingApp;
  let rpc: ReturnType<typeof createLocalRPCClient<typeof VaultRpcSchema>>;

  beforeEach(async () => {
    tempDir = createTempFile();
    vaultFile = `${tempDir}/test.vault`;
    await writeVault(vaultFile, "old-password", { vaultVersion: 1, entries: { env: { API_KEY: "a", OTHER: "b" }, token: { github: "t" } } });
    vault = new VaultService({ vaultFile });
    vault.setPassword("old-password");
    await vault.unlock();
    app = createTestingApp();
    app.addService(VaultService, vault);
    rpc = createLocalRPCClient(vaultRPC, app);
  });

  afterEach(async () => {
    vault.lock();
    await fs.remove(tempDir);
  });

  describe("moveItem", () => {
    it("renames a key within its category", async () => {
      expect(await rpc.moveItem({ from: { category: "env", key: "API_KEY" }, to: { category: "env", key: "OPENAI_KEY" } })).toMatchObject({ success: true });
      const data = await readVault(vaultFile, "old-password");
      expect(data.entries.env).toEqual({ OPENAI_KEY: "a", OTHER: "b" });
    });

    it("moves a key to another category and drops the emptied category", async () => {
      await rpc.moveItem({ from: { category: "token", key: "github" }, to: { category: "env", key: "GITHUB_TOKEN" } });
      const data = await readVault(vaultFile, "old-password");
      expect(data.entries.token).toBeUndefined();
      expect(data.entries.env?.GITHUB_TOKEN).toBe("t");
    });

    it("refuses to overwrite an existing key unless asked", async () => {
      const refused = await rpc.moveItem({ from: { category: "env", key: "API_KEY" }, to: { category: "env", key: "OTHER" } });
      expect(refused).toMatchObject({ success: false, message: expect.stringContaining("already exists") });
      expect((await readVault(vaultFile, "old-password")).entries.env).toEqual({ API_KEY: "a", OTHER: "b" });

      await rpc.moveItem({ from: { category: "env", key: "API_KEY" }, to: { category: "env", key: "OTHER" }, overwrite: true });
      expect((await readVault(vaultFile, "old-password")).entries.env).toEqual({ OTHER: "a" });
    });

    it("reports a missing source key", async () => {
      expect(await rpc.moveItem({ from: { category: "env", key: "NOPE" }, to: { category: "env", key: "X" } })).toMatchObject({ success: false });
    });
  });

  describe("createCategory", () => {
    it("creates an empty category that the listing shows", async () => {
      expect(await rpc.createCategory({ category: " database " })).toMatchObject({ success: true });
      expect(await rpc.listEntries({})).toMatchObject({ database: [] });
      expect((await readVault(vaultFile, "old-password")).entries.database).toEqual({});
    });

    it("rejects a duplicate category", async () => {
      expect(await rpc.createCategory({ category: "env" })).toMatchObject({ success: false });
    });
  });

  describe("lock and unlock", () => {
    it("lock sticks: reads do not silently unlock", async () => {
      vault.setPasswordResolver(async () => "old-password");
      expect(await rpc.lock({})).toMatchObject({ success: true });
      expect(await rpc.getStatus({})).toMatchObject({ unlocked: false });
      expect(await rpc.listEntries({})).toEqual({});
      expect(rpc.getItem({ category: "env", key: "API_KEY" })).rejects.toThrow(/locked/);
      expect(vault.unlocked).toBe(false);
    });

    it("unlocks from the resolver, or with a typed password that is verified", async () => {
      vault.lock();
      expect(await rpc.unlock({ password: "wrong" })).toMatchObject({ success: false });
      expect(vault.unlocked).toBe(false);
      expect(await rpc.unlock({ password: "old-password" })).toMatchObject({ success: true });
      expect(await rpc.getItem({ category: "env", key: "API_KEY" })).toEqual({ found: true, value: "a" });

      vault.lock();
      vault.setPasswordResolver(async () => "old-password");
      expect(await rpc.unlock({})).toMatchObject({ success: true });
      expect(vault.unlocked).toBe(true);
    });
  });

  describe("changePassword", () => {
    it("verifies the current password, re-encrypts, and updates the stored password", async () => {
      const store = fakeStore("old-password");
      vault.setPasswordStore(store);

      expect(await rpc.changePassword({ currentPassword: "not-it", newPassword: "new-password" })).toMatchObject({
        success: false,
        message: "The current password is incorrect",
      });
      expect(store.updates).toEqual([]);

      expect(await rpc.changePassword({ currentPassword: "old-password", newPassword: "new-password" })).toMatchObject({ success: true });
      expect(store.stored).toBe("new-password");
      expect((await readVault(vaultFile, "new-password")).entries.env?.API_KEY).toBe("a");
      expect(readVault(vaultFile, "old-password")).rejects.toThrow();

      // The session keeps working with the new password: writes re-encrypt with it.
      await vault.setItem("env", "NEW", "v");
      expect((await readVault(vaultFile, "new-password")).entries.env?.NEW).toBe("v");
      expect((await fs.readdir(tempDir)).filter(name => name.endsWith(".tmp"))).toEqual([]);
    });

    it("leaves everything unchanged when the stored password cannot be updated", async () => {
      vault.setPasswordStore(fakeStore("old-password", { failUpdate: true }));
      const result = await rpc.changePassword({ currentPassword: "old-password", newPassword: "new-password" });
      expect(result).toMatchObject({ success: false, message: expect.stringContaining("nothing was changed") });
      expect((await readVault(vaultFile, "old-password")).entries.env?.API_KEY).toBe("a");
      expect((await fs.readdir(tempDir)).filter(name => name.endsWith(".tmp"))).toEqual([]);
    });

    it("refuses when the password comes from somewhere it cannot update", async () => {
      vault.setPasswordStore(fakeStore("old-password", { canUpdate: false }));
      expect(await rpc.getStatus({})).toMatchObject({ canChangePassword: false, reason: "env" });
      expect(await rpc.changePassword({ currentPassword: "old-password", newPassword: "new-password" })).toMatchObject({ success: false, message: "env" });
    });
  });
});
