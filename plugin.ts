import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import { z } from "zod";
import agentCommands from "./commands.ts";
import { VaultService } from "./index.ts";
import packageJSON from "./package.json";
import vaultRPC from "./rpc/vault.ts";
import { VaultConfigSchema } from "./schema.ts";
import { secrets } from "bun";
import fs from "fs";

const packageConfigSchema = z.object({
  vault: VaultConfigSchema.exactOptional(),
});

export default {
  name: packageJSON.name,
  displayName: "Credential Vault",
  version: packageJSON.version,
  description: packageJSON.description,
  async earlyInstall(app, config) {
    if (config.vault) {
      const vaultService = new VaultService(config.vault);

      let vaultPassword = process.env.TR_VAULT_PASSWORD ?? null;
      if (!vaultPassword) {
        vaultPassword = await secrets.get({
          service: "tokenring",
          name: "vault-password",
        });
      }

      if (! vaultPassword) {
        const exists = fs.existsSync(config.vault.vaultFile);
        if (exists) {
          vaultPassword = prompt("Please enter your TokenRing vault password to unlock your vault, or press enter to not use your vault for this session.\nPassword:")
        } else {
          vaultPassword = prompt(`
You have enabled the TokenRing vault, which stores session tokens and API keys in an AES-256 encrypted file at ${config.vault.vaultFile}.
To use the vault, you will need to create a password, which you will need to be entered at startup, or it can be provided via the TR_VAULT_PASSWORD environment variable.
This password will be used to encrypt and decrypt the vault file.

Enter a password to use:`.trim());

          const confirmPassword = prompt("Confirm your new password:");
          if (confirmPassword !== vaultPassword) {
            console.error("Passwords do not match. Vault setup aborted.");
            process.exit(1);
          }
        }
      }

      if (vaultPassword) {
        vaultService.setPassword(vaultPassword);
        await vaultService.unlock();
        vaultService.injectEnv();
      }

      app.addServices(vaultService);
      app.waitForService(AgentCommandService, commandService => {
        commandService.addAgentCommands(agentCommands);
      });
      app.waitForService(RpcService, rpcService => {
        rpcService.registerEndpoint(vaultRPC);
      });
    }
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
