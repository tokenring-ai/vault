import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import VaultService from "../../VaultService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const keys = Object.keys(await agent.requireServiceByType(VaultService).unlockVault(agent));
  return keys.length === 0 ? "Vault is empty" : `Vault credentials:\n${markdownList(keys)}`;
}

export default {
  name: "vault list",
  description: "List vault credentials",
  help: `List all credential keys stored in the vault.

## Example

/vault list`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
