import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import fs from "fs-extra";
import plugin from "../plugin.ts";
import { createTempFile } from "./test-utils.ts";

describe("Vault Plugin", () => {
  let mockApp: TokenRingApp;
  let _consoleLogSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let previousVaultPassword: string | undefined;

  beforeEach(() => {
    _consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    mockApp = createTestingApp();
    tempDir = createTempFile();
    previousVaultPassword = process.env.TR_VAULT_PASSWORD;
  });

  afterEach(async () => {
    if (previousVaultPassword === undefined) {
      delete process.env.TR_VAULT_PASSWORD;
    } else {
      process.env.TR_VAULT_PASSWORD = previousVaultPassword;
    }
    await fs.remove(tempDir);
    mock.clearAllMocks();
  });

  describe("plugin metadata", () => {
    it("should have correct plugin properties", () => {
      expect(plugin.name).toBe("@tokenring-ai/vault");
      expect(plugin.version).toBe("0.2.0");
      expect(plugin.description).toBe("Secure storage service for managing sensitive API keys and persistent credentials.");
    });

    it("should be a valid TokenRingPlugin", () => {
      expect(typeof plugin.earlyInstall).toBe("function");
    });
  });

  describe("earlyInstall", () => {
    it("should install and unlock when TR_VAULT_PASSWORD is provided", async () => {
      const mockAddServices = spyOn(mockApp, "addServices");
      const mockWaitForService = spyOn(mockApp, "waitForService");
      const vaultFile = `${tempDir}/test.vault`;
      process.env.TR_VAULT_PASSWORD = "test-password";

      await plugin.earlyInstall(mockApp, {
        vault: {
          vaultFile,
          relockTime: 300000,
        },
      });

      expect(mockAddServices).toHaveBeenCalled();
      expect(mockWaitForService).toHaveBeenCalled();
      expect(await fs.pathExists(vaultFile)).toBe(true);
    });

    it("should unlock an existing vault with TR_VAULT_PASSWORD", async () => {
      const vaultFile = `${tempDir}/existing.vault`;
      process.env.TR_VAULT_PASSWORD = "existing-password";

      // Initialize vault on first install
      await plugin.earlyInstall(createTestingApp(), {
        vault: { vaultFile },
      });
      expect(await fs.pathExists(vaultFile)).toBe(true);

      // Unlock again with the same password
      const mockAddServices = spyOn(mockApp, "addServices");
      await plugin.earlyInstall(mockApp, {
        vault: { vaultFile },
      });
      expect(mockAddServices).toHaveBeenCalled();
    });
  });
});
