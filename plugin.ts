import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {RpcService} from "@tokenring-ai/rpc";
import {z} from "zod";
import agentCommands from "./commands.ts";
import {VaultService} from "./index.ts";
import packageJSON from "./package.json";
import vaultRPC from "./rpc/vault.ts";
import {VaultConfigSchema} from "./schema.ts";

const packageConfigSchema = z.object({
  vault: VaultConfigSchema.optional()
});

export default {
  name: packageJSON.name,
  displayName: "Credential Vault",
  version: packageJSON.version,
  description: packageJSON.description,
  async earlyInstall(app, config) {
    if (config.vault) {
      const vaultService = new VaultService(config.vault);
      if (process.env.TR_VAULT_PASSWORD) {
        vaultService.setPassword(process.env.TR_VAULT_PASSWORD);
        await vaultService.unlock();
        vaultService.injectEnv();
      }

      app.addServices(vaultService);
      app.waitForService(AgentCommandService, commandService => {
        commandService.addAgentCommands(agentCommands)
      });
      app.waitForService(RpcService, rpcService => {
        rpcService.registerEndpoint(vaultRPC);
      });
    }
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;