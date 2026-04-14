import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "vault lock",
  description: "Lock the vault",
  help: `Lock the vault.

## Example

/vault lock`,
  inputSchema,
  execute({agent}: AgentCommandInputType<typeof inputSchema>) {
    agent.requireServiceByType(VaultService).lock();
    return "Vault locked";
  }
} satisfies TokenRingAgentCommand<typeof inputSchema>;
