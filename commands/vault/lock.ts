import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.js";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "vault lock",
  description: "Lock the vault",
  help: `Lock the vault.

## Example

/vault lock`,
  inputSchema,
  execute: async ({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    await agent.requireServiceByType(VaultService).lock();
    return "Vault locked";
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
