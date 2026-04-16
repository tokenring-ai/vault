import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {name: "key", description: "Credential key", required: true},
    {name: "value", description: "Credential value", required: true},
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({
                         positionals: {key, value},
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const [category, ...rest] = key.split(".");
  const k = rest.join(".");
  if (!k) throw new Error(`Key must be in format "category.key"`);
  await agent
    .requireServiceByType(VaultService)
    .setItem(category, k, value);
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
