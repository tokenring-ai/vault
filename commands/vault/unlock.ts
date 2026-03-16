import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.js";

export default {
  name: "vault unlock",
  description: "Unlock the vault",
  help: `# /vault unlock

Unlock the vault with a password prompt.

## Example

/vault unlock`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    await agent.requireServiceByType(VaultService).unlockVault(agent);
    return "Vault unlocked successfully";
  },
} satisfies TokenRingAgentCommand;
