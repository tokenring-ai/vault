import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type Agent from "@tokenring-ai/agent/Agent";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import fs from "fs-extra";
import VaultService from "../VaultService.ts";
import { createTempFile } from "./test-utils.ts";

const TEST_CATEGORY = "test";

describe("VaultService", () => {
  let vaultService: VaultService;
  let tempDir: string;
  let tempVaultFile: string;
  let agent: Agent;
  let app: TokenRingApp;

  beforeEach(() => {
    tempDir = createTempFile();
    tempVaultFile = `${tempDir}/test.vault`;

    app = createTestingApp();
    agent = createTestingAgent(app);

    const config = {
      vaultFile: tempVaultFile,
      relockTime: 300000,
    };

    vaultService = new VaultService(config);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    mock.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with correct configuration", () => {
      expect(vaultService.name).toBe("VaultService");
      expect(vaultService.description).toBe("A vault service for storing persisted credentials");
    });
  });

  describe("unlock", () => {
    it("should initialize new vault if file does not exist", async () => {
      const askForTextSpy = spyOn(agent, "askForText").mockResolvedValue("test-password");

      const result = await vaultService.unlock(agent);

      expect(result).toEqual({ vaultVersion: 1, entries: {} });
      expect(askForTextSpy).toHaveBeenCalledWith({
        message: "Set a vault password so Google tokens can be stored securely.",
        label: "New Vault Password",
        masked: true,
      });
    });

    it("should unlock existing vault with correct password", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      const existingService = new VaultService({ vaultFile: tempVaultFile });
      const askForTextSpy2 = spyOn(agent, "askForText").mockResolvedValue("test-password");

      const result = await existingService.unlock(agent);

      expect(result).toEqual({ vaultVersion: 1, entries: {} });
      expect(askForTextSpy2).toHaveBeenCalledWith({
        message: "Enter the vault password to continue.",
        label: "Vault Password",
        masked: true,
      });
    });

    it("should throw error on incorrect password", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      const wrongService = new VaultService({ vaultFile: tempVaultFile });
      wrongService.setPassword("wrong-password");

      expect(wrongService.unlock()).rejects.toThrow("did you provide the right vault password");
    });

    it("should handle empty password cancellation", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      const existingService = new VaultService({ vaultFile: tempVaultFile });
      spyOn(agent, "askForText").mockResolvedValue("");

      expect(existingService.unlock(agent)).rejects.toThrow("Vault unlock cancelled");
    });
  });

  describe("lock", () => {
    it("should lock the vault and clear session data", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      vaultService.lock();

      expect(vaultService).toHaveProperty("vaultData", undefined);
    });
  });

  describe("save", () => {
    it("should save vault data when unlocked", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      const testData = [
        { category: TEST_CATEGORY, key: "key1", value: "value1" },
        { category: TEST_CATEGORY, key: "key2", value: "value2" },
      ];
      await vaultService.save(testData);

      const savedData = await vaultService.unlock(agent);
      expect(savedData).toEqual({
        vaultVersion: 1,
        entries: { [TEST_CATEGORY]: { key1: "value1", key2: "value2" } },
      });
    });

    it("should throw error when trying to save without unlocking", async () => {
      const testData = [{ category: TEST_CATEGORY, key: "key1", value: "value1" }];

      expect(vaultService.save(testData)).rejects.toThrow("No password was set before saving vault");
    });
  });

  describe("requireItem", () => {
    it("should get existing item", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      await vaultService.setItem(TEST_CATEGORY, "test-key", "test-value");

      const value = vaultService.requireItem(TEST_CATEGORY, "test-key");
      expect(value).toBe("test-value");
    });

    it("should throw for non-existing item", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      expect(() => vaultService.requireItem(TEST_CATEGORY, "non-existing-key")).toThrow();
    });
  });

  describe("setItem", () => {
    it("should set new item", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      await vaultService.setItem(TEST_CATEGORY, "new-key", "new-value");

      const value = vaultService.requireItem(TEST_CATEGORY, "new-key");
      expect(value).toBe("new-value");
    });

    it("should update existing item", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);

      await vaultService.setItem(TEST_CATEGORY, "test-key", "first-value");
      await vaultService.setItem(TEST_CATEGORY, "test-key", "updated-value");

      const value = vaultService.requireItem(TEST_CATEGORY, "test-key");
      expect(value).toBe("updated-value");
    });
  });

  describe("unlocked", () => {
    it("should return false when vault is locked", () => {
      expect(vaultService.unlocked).toBe(false);
    });

    it("should return true when vault is unlocked", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      expect(vaultService.unlocked).toBe(true);
    });

    it("should return false after locking", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      vaultService.lock();
      expect(vaultService.unlocked).toBe(false);
    });
  });

  describe("requireItem when locked or missing", () => {
    it("should throw when vault is locked", () => {
      expect(() => vaultService.requireItem(TEST_CATEGORY, "any-key")).toThrow("Vault is uninitialized or locked");
    });

    it("should throw for missing key when vault is unlocked", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      expect(() => vaultService.requireItem(TEST_CATEGORY, "missing-key")).toThrow();
    });

    it("should return value for existing key when vault is unlocked", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      await vaultService.setItem(TEST_CATEGORY, "test-key", "test-value");
      expect(vaultService.requireItem(TEST_CATEGORY, "test-key")).toBe("test-value");
    });

    it("should throw after vault is locked", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      await vaultService.setItem(TEST_CATEGORY, "test-key", "test-value");
      expect(vaultService.requireItem(TEST_CATEGORY, "test-key")).toBe("test-value");
      vaultService.lock();
      expect(() => vaultService.requireItem(TEST_CATEGORY, "test-key")).toThrow("Vault is uninitialized or locked");
    });
  });

  describe("session management", () => {
    it("should cache session password during operation", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      mock.clearAllMocks();

      await vaultService.unlock(agent);

      expect(agent.askForText).not.toHaveBeenCalled();
    });

    it("should retain session password across lock", async () => {
      spyOn(agent, "askForText").mockResolvedValue("test-password");
      await vaultService.unlock(agent);
      vaultService.lock();
      mock.clearAllMocks();

      await vaultService.unlock(agent);

      expect(agent.askForText).not.toHaveBeenCalled();
    });
  });
});
