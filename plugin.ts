import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";

import {z} from "zod";
import agentCommands from "./commands.ts";
import {VaultService} from "./index.ts";
import packageJSON from "./package.json";
import {VaultConfigSchema} from "./schema.ts";

const packageConfigSchema = z.object({
  vault: VaultConfigSchema.optional()
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  async install(app, config) {
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
      })
    }
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;