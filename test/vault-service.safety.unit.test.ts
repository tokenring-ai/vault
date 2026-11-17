import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import VaultService from "../VaultService.ts";
import { readVault } from "../vault.ts";
import { createTempFile } from "./test-utils.ts";

const PASSWORD = "test-password";

describe("VaultService write safety", () => {
  let tempDir: string;
  let vaultFile: string;
  let service: VaultService;

  beforeEach(async () => {
    tempDir = createTempFile();
    vaultFile = `${tempDir}/test.vault`;
    service = new VaultService({ vaultFile });
    service.setPasswordResolver(async () => PASSWORD);
    await service.unlockWithPassword(PASSWORD);
  });

  afterEach(async () => {
    service.lock();
    await fs.remove(tempDir);
  });

  it("keeps every one of several simultaneous writes", async () => {
    await Promise.all([service.setItem("env", "a", "1"), service.setItem("env", "b", "2"), service.setItem("env", "c", "3"), service.createCategory("extra")]);
    expect((await readVault(vaultFile, PASSWORD)).entries).toEqual({ env: { a: "1", b: "2", c: "3" }, extra: {} });
  });

  it("leaves no temp files behind and keeps the file private", async () => {
    await service.setItem("env", "a", "1");
    expect(await fs.readdir(tempDir)).toEqual(["test.vault"]);
    expect((await fs.stat(vaultFile)).mode & 0o777).toBe(0o600);
  });

  it("refuses names that would reach Object.prototype, without polluting it", async () => {
    await expect(service.setItem("__proto__", "polluted", "yes")).rejects.toThrow("cannot be used");
    await expect(service.setItem("constructor", "k", "v")).rejects.toThrow("cannot be used");
    await expect(service.createCategory("prototype")).rejects.toThrow("cannot be used");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(service.getSecret("constructor", "name")).toBeUndefined();
  });

  it("stays locked when something writes to a locked vault", async () => {
    service.lock();
    await service.setItem("google", "token", "refreshed");

    expect(service.unlocked).toBe(false);
    expect(service.getSecret("google", "token")).toBeUndefined();
    expect((await readVault(vaultFile, PASSWORD)).entries.google).toEqual({ token: "refreshed" });
  });

  it("stays locked when the vault is locked while a write is running", async () => {
    const write = service.setItem("env", "a", "1");
    service.lock();
    await write;
    expect(service.unlocked).toBe(false);
  });

  it("keeps the vault unlocked, with the new value, after an ordinary write", async () => {
    await service.setItem("env", "a", "1");
    expect(service.unlocked).toBe(true);
    expect(service.getSecret("env", "a")).toBe("1");
  });
});
