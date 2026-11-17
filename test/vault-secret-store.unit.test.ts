import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import VaultService from "../VaultService.ts";
import { createTempFile } from "./test-utils.ts";

const PASSWORD = "test-password";

/** The vault as the app's secret store: other plugins save keys through it and hear when values change. */
describe("VaultService as a writable secret store", () => {
  let tempDir: string;
  let service: VaultService;
  let changes: number;

  beforeEach(() => {
    tempDir = createTempFile();
    service = new VaultService({ vaultFile: `${tempDir}/test.vault` });
    service.setPasswordResolver(async () => PASSWORD);
    changes = 0;
    service.onChange(() => changes++);
  });

  afterEach(async () => {
    service.lock();
    await fs.remove(tempDir);
  });

  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it("is writable only while unlocked, and reports the unlock as a change", async () => {
    expect(service.writable).toBe(false);
    await service.unlockWithPassword(PASSWORD);
    expect(service.writable).toBe(true);
    expect(changes).toBe(1);
  });

  it("stores and removes secrets, reporting each write, but not a lock", async () => {
    await service.unlockWithPassword(PASSWORD);
    await service.storeSecret("env", "OPENAI_API_KEY", "sk-1");
    await settle();
    expect(service.getSecret("env", "OPENAI_API_KEY")).toBe("sk-1");
    expect(changes).toBe(2);

    await service.removeSecret("env", "OPENAI_API_KEY");
    await settle();
    expect(service.getSecret("env", "OPENAI_API_KEY")).toBeUndefined();
    expect(changes).toBe(3);

    // Removing something that isn't there writes nothing.
    await service.removeSecret("env", "OPENAI_API_KEY");
    await settle();
    expect(changes).toBe(3);

    service.lock();
    await settle();
    expect(changes).toBe(3);
  });
});
