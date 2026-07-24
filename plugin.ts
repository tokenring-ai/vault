import crypto from "node:crypto";
import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import { secrets } from "bun";
import { z } from "zod";
import agentCommands from "./commands.ts";
import { VaultService } from "./index.ts";
import packageJSON from "./package.json";
import vaultRPC from "./rpc/vault.ts";
import { VaultConfigSchema } from "./schema.ts";

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

export default {
  name: packageJSON.name,
  displayName: "Credential Vault",
  version: packageJSON.version,
  description: packageJSON.description,
  async earlyInstall(app, config) {
    const vaultService = new VaultService(config.vault);

    const vaultPassword = await resolveVaultPassword();
    vaultService.setPassword(vaultPassword);
    await vaultService.unlock();
    vaultService.injectEnv();

    app.addServices(vaultService);
    app.waitForService(AgentCommandService, commandService => {
      commandService.addAgentCommands(agentCommands);
    });
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(vaultRPC);
    });
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
