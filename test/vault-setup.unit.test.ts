import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type Agent from "@tokenring-ai/agent/Agent";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import createLocalRPCClient from "@tokenring-ai/rpc/createLocalRPCClient";
import fs from "fs-extra";
import setupCommand from "../commands/vault/setup.ts";
import unlockCommand from "../commands/vault/unlock.ts";
import type VaultRpcSchema from "../rpc/schema.ts";
import vaultRPC from "../rpc/vault.ts";
import { MIN_VAULT_PASSWORD_LENGTH } from "../schema.ts";
import VaultService, { type VaultPasswordStore } from "../VaultService.ts";
import { readVault, writeVault } from "../vault.ts";
import { createTempFile } from "./test-utils.ts";

const PASSWORD = "correct horse battery";

/** A password store whose `remember` works or fails as told; the saved value is kept for inspection. */
function fakeStore(options: { remember?: "stores" | "fails" | "throws" | "missing" } = {}) {
  const store = {
    saved: undefined as string | undefined,
    describe: () => ({ source: "keychain", canUpdate: true }),
    async update() {},
  } as VaultPasswordStore & { saved: string | undefined };
  if (options.remember !== "missing") {
    store.remember = async password => {
      if (options.remember === "throws") throw new Error(`keychain exploded for ${password}`);
      if (options.remember === "fails") return { stored: false, reason: "this computer has no secure password store that TokenRing can use" };
      store.saved = password;
      return { stored: true };
    };
  }
  return store;
}

describe("vault setup", () => {
  let tempDir: string;
  let vaultFile: string;
  let app: TokenRingApp;
  let vault: VaultService;
  let rpc: ReturnType<typeof createLocalRPCClient<typeof VaultRpcSchema>>;
  let previousEnv: string | undefined;

  beforeEach(() => {
    previousEnv = process.env.TR_VAULT_PASSWORD;
    delete process.env.TR_VAULT_PASSWORD;
    tempDir = createTempFile();
    vaultFile = `${tempDir}/test.vault`;
    vault = new VaultService({ vaultFile });
    app = createTestingApp();
    app.addService(VaultService, vault);
    rpc = createLocalRPCClient(vaultRPC, app);
  });

  afterEach(async () => {
    vault.lock();
    if (previousEnv === undefined) delete process.env.TR_VAULT_PASSWORD;
    else process.env.TR_VAULT_PASSWORD = previousEnv;
    await fs.remove(tempDir);
  });

  describe("status", () => {
    it("reports no vault file, locked, and unlocked", async () => {
      vault.setPasswordStore(fakeStore());
      expect(await rpc.getStatus({})).toMatchObject({ unlocked: false, vaultExists: false });

      await writeVault(vaultFile, PASSWORD, { vaultVersion: 1, entries: {} });
      expect(await rpc.getStatus({})).toMatchObject({ unlocked: false, vaultExists: true });

      await vault.unlockWithPassword(PASSWORD);
      expect(await rpc.getStatus({})).toMatchObject({ unlocked: true, vaultExists: true });
    });

    it("leaks nothing beyond the known fields", async () => {
      vault.setPasswordStore(fakeStore());
      expect(Object.keys(await rpc.getStatus({})).sort()).toEqual(["canChangePassword", "passwordSource", "unlocked", "vaultExists"]);
    });
  });

  describe("createVault", () => {
    it("creates, unlocks and stores the password, without echoing it", async () => {
      const store = fakeStore();
      vault.setPasswordStore(store);
      const result = await rpc.createVault({ password: PASSWORD });

      expect(result).toMatchObject({ success: true, passwordStored: true });
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
      expect(store.saved).toBe(PASSWORD);
      expect(vault.unlocked).toBe(true);
      expect(await readVault(vaultFile, PASSWORD)).toEqual({ vaultVersion: 1, entries: {} });
      expect((await fs.stat(vaultFile)).mode & 0o777).toBe(0o600);
    });

    it("refuses a password that is too short and creates nothing", async () => {
      const result = await rpc.createVault({ password: "x".repeat(MIN_VAULT_PASSWORD_LENGTH - 1) });
      expect(result).toMatchObject({ success: false, passwordStored: false });
      expect(result.message).toContain(String(MIN_VAULT_PASSWORD_LENGTH));
      expect(await fs.pathExists(vaultFile)).toBe(false);
      expect(vault.unlocked).toBe(false);
    });

    it("never overwrites an existing vault", async () => {
      await writeVault(vaultFile, "the-original-password", { vaultVersion: 1, entries: { env: { A: "1" } } });
      const before = await fs.readFile(vaultFile, "utf8");
      const result = await rpc.createVault({ password: PASSWORD });
      expect(result).toMatchObject({ success: false });
      expect(result.message).toContain("already exists");
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
      expect(await fs.readFile(vaultFile, "utf8")).toBe(before);
      expect(vault.unlocked).toBe(false);
    });

    it("lets only one of two simultaneous creations win", async () => {
      const results = await Promise.all([rpc.createVault({ password: PASSWORD }), rpc.createVault({ password: `${PASSWORD} two` })]);
      expect(results.filter(result => result.success)).toHaveLength(1);
    });

    for (const remember of ["fails", "throws", "missing"] as const) {
      it(`says honestly that the password is needed at every start when the store ${remember}`, async () => {
        vault.setPasswordStore(fakeStore({ remember }));
        const result = await rpc.createVault({ password: PASSWORD });
        expect(result).toMatchObject({ success: true, passwordStored: false });
        expect(result.message).toContain("every time TokenRing starts");
        expect(result.message).toContain("TR_VAULT_PASSWORD");
        expect(result.message).not.toContain(PASSWORD);
        expect(vault.unlocked).toBe(true);
        expect(await readVault(vaultFile, PASSWORD)).toBeDefined();
      });
    }
  });

  describe("unlock with no vault", () => {
    it("says no vault is set up instead of creating one from a typed password", async () => {
      const result = await rpc.unlock({ password: PASSWORD });
      expect(result).toEqual({ success: false, message: "No vault is set up yet: run /vault setup" });
      expect(await fs.pathExists(vaultFile)).toBe(false);
    });

    it("says no vault is set up when no password source works", async () => {
      vault.setPasswordResolver(async () => {
        throw new Error("no keychain");
      });
      expect(await rpc.unlock({})).toMatchObject({ success: false, message: "No vault is set up yet: run /vault setup" });
    });

    it("still reports a wrong password for an existing vault", async () => {
      await writeVault(vaultFile, PASSWORD, { vaultVersion: 1, entries: {} });
      const result = await rpc.unlock({ password: "wrong-password" });
      expect(result.success).toBe(false);
      expect(result.message).toContain("Did you provide the right password");
    });
  });

  describe("boot with no keychain and no TR_VAULT_PASSWORD", () => {
    const failingResolver = async () => {
      throw new Error("Vault is required but no password is available.");
    };

    it("starts with the vault not set up, without throwing or reporting an error", async () => {
      const errors: string[] = [];
      vault.setErrorReporter(message => errors.push(message));
      vault.setPasswordResolver(failingResolver);
      expect(await vault.unlockAtStartup()).toBe(false);
      expect(vault.unlocked).toBe(false);
      expect(vault.vaultFileExists()).toBe(false);
      expect(errors).toEqual([]);
      await vault.start();
      expect(await fs.pathExists(vaultFile)).toBe(false);
    });

    it("starts with an existing vault locked, and says how to unlock it", async () => {
      await writeVault(vaultFile, PASSWORD, { vaultVersion: 1, entries: {} });
      const errors: string[] = [];
      vault.setErrorReporter(message => errors.push(message));
      vault.setPasswordResolver(failingResolver);
      expect(await vault.unlockAtStartup()).toBe(false);
      expect(vault.vaultFileExists()).toBe(true);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("/vault unlock");
    });
  });

  describe("/vault setup and /vault unlock", () => {
    let agent: Agent;

    beforeEach(() => {
      agent = createTestingAgent(app);
      vault.setPasswordStore(fakeStore());
      vault.setPasswordResolver(async () => {
        throw new Error("no keychain");
      });
    });

    const run = (command: typeof setupCommand | typeof unlockCommand) => command.execute({ agent, args: {}, positionals: [] } as never);

    it("asks twice with masked questions and creates the vault", async () => {
      const ask = spyOn(agent, "askForText").mockResolvedValueOnce(PASSWORD).mockResolvedValueOnce(PASSWORD);
      const message = await run(setupCommand);
      expect(message).toContain("Vault created and unlocked");
      expect(message).not.toContain(PASSWORD);
      expect(ask).toHaveBeenCalledTimes(2);
      for (const call of ask.mock.calls) expect(call[0].masked).toBe(true);
      expect(vault.unlocked).toBe(true);
    });

    it("refuses a mismatch, a short password, and a cancel without creating anything", async () => {
      spyOn(agent, "askForText").mockResolvedValueOnce(PASSWORD).mockResolvedValueOnce("something else entirely");
      await expect(run(setupCommand)).rejects.toThrow("did not match");

      spyOn(agent, "askForText").mockReset().mockResolvedValueOnce("short");
      await expect(run(setupCommand)).rejects.toThrow(`at least ${MIN_VAULT_PASSWORD_LENGTH}`);

      spyOn(agent, "askForText").mockReset().mockResolvedValueOnce(null);
      await expect(run(setupCommand)).rejects.toThrow("cancelled");
      expect(await fs.pathExists(vaultFile)).toBe(false);
    });

    it("refuses when a vault already exists", async () => {
      await writeVault(vaultFile, "the-original-password", { vaultVersion: 1, entries: {} });
      const ask = spyOn(agent, "askForText");
      await expect(run(setupCommand)).rejects.toThrow("/vault unlock");
      expect(ask).not.toHaveBeenCalled();
    });

    it("/vault unlock points at /vault setup when no vault exists, and does not prompt", async () => {
      const ask = spyOn(agent, "askForText");
      await expect(run(unlockCommand)).rejects.toThrow("No vault is set up yet: run /vault setup");
      expect(ask).not.toHaveBeenCalled();
      expect(await fs.pathExists(vaultFile)).toBe(false);
    });
  });
});
