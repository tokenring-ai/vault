import crypto from "node:crypto";
import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import { SecretService } from "@tokenring-ai/secrets";
import { secrets } from "bun";
import type { ZodNever } from "zod";
import { z } from "zod";
import agentCommands from "./commands.ts";
import { VaultService } from "./index.ts";
import packageJSON from "./package.json";
import vaultRPC from "./rpc/vault.ts";
import { VaultConfigSchema } from "./schema.ts";
import type { VaultPasswordStore } from "./VaultService.ts";

const packageConfigSchema = z.object({
  vault: VaultConfigSchema,
});

const SECRETS_SERVICE = "tokenring";
const SECRETS_NAME = "vault-password";

/**
 * Resolve the vault password without prompting.
 * Preference order:
 * 1. TR_VAULT_PASSWORD environment variable
 * 2. System secrets manager (auto-generate and store if missing)
 */
async function resolveVaultPassword(): Promise<string> {
  const fromEnv = process.env.TR_VAULT_PASSWORD;
  if (fromEnv) {
    return fromEnv;
  }

  try {
    const existing = await secrets.get({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
    });
    if (existing) {
      return existing;
    }

    // Secrets manager is available but no key is stored yet — generate one.
    const generated = crypto.randomBytes(32).toString("base64url");
    await secrets.set({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
      value: generated,
    });
    return generated;
  } catch {
    // Secrets manager is not available on this platform.
  }

  throw new Error(
    "Vault is required but no password is available. " + "Set the TR_VAULT_PASSWORD environment variable, or run on a system with a secrets manager.",
  );
}

/**
 * The OS secrets-manager entry `resolveVaultPassword` reads. A password set through
 * TR_VAULT_PASSWORD cannot be changed from a running server (the next start would read
 * the old value from the environment), so changes are refused in that case.
 */
const keychainPasswordStore: VaultPasswordStore = {
  describe() {
    if (process.env.TR_VAULT_PASSWORD) {
      return {
        source: "environment",
        canUpdate: false,
        reason:
          "The vault password comes from the TR_VAULT_PASSWORD environment variable. Change it with `vault change-password`, then update the variable and restart.",
      };
    }
    return { source: "keychain", canUpdate: true };
  },
  async update(currentPassword, newPassword) {
    if (process.env.TR_VAULT_PASSWORD) throw new Error("TR_VAULT_PASSWORD is set; the environment cannot be updated from here");
    let stored: string | null;
    try {
      stored = await secrets.get({ service: SECRETS_SERVICE, name: SECRETS_NAME });
    } catch {
      // No secrets manager on this platform: the password was typed in, nothing is stored.
      return;
    }
    // Only replace the entry this vault was opened with; anything else is not ours to touch.
    if (stored !== currentPassword) return;
    await secrets.set({ service: SECRETS_SERVICE, name: SECRETS_NAME, value: newPassword });
  },
};

export default {
  name: packageJSON.name,
  displayName: "Credential Vault",
  version: packageJSON.version,
  description: packageJSON.description,
  async earlyInstall(app, config) {
    const vaultService = app.addService(VaultService, new VaultService(config.vault));

    // The resolver is kept so a locked vault (via /vault lock or relockTime)
    // re-reads the password from the environment / OS secrets manager on next use.
    vaultService.setPasswordResolver(resolveVaultPassword);
    vaultService.setPasswordStore(keychainPasswordStore);
    await vaultService.unlock();

    // Vault entries are read through explicit `{ source: "vault" }` config
    // references rather than being injected into the process environment.
    app.waitForService(SecretService, secretService => secretService.setStore(vaultService));

    app.waitForService(AgentCommandService, commandService => {
      commandService.addAgentCommands(agentCommands);
    });
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(vaultRPC);
    });
  },
  immutableConfigSchema: packageConfigSchema,
} satisfies TokenRingPlugin<ZodNever, typeof packageConfigSchema>;
