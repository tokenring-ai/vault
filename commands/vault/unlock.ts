import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "vault unlock",
  description: "Unlock the vault",
  help: `Unlock the vault with a password prompt.

## Example

/vault unlock`,
  inputSchema,
  execute: async ({
                    agent,
                  }: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    await agent.requireServiceByType(VaultService).unlock(agent);
    return "Vault unlocked successfully";
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
