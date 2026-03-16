import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.js";

export default {
  name: "vault lock",
  description: "Lock the vault",
  help: `# /vault lock

Lock the vault.

## Example

/vault lock`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    await agent.requireServiceByType(VaultService).lock();
    return "Vault locked";
  },
} satisfies TokenRingAgentCommand;
