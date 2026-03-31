import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.ts";

const inputSchema = {
  args: {},
  positionals: [{name: "key", description: "Credential key", required: true}]
} as const satisfies AgentCommandInputSchema;

async function execute({positionals: {key}, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const value = await agent.askForText({ masked: true, message: `Enter value for "${key}"`, label: "Value" });
  if (!value) return "Store cancelled";
  await agent.requireServiceByType(VaultService).setItem(key, value);
  return `Stored credential: ${key}`;
}

export default {
  name: "vault store",
  description: "Store a credential",
  help: `Store a credential in the vault. Prompts securely for the value.

## Example

/vault store api_key`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
