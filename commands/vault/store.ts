import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.ts";

const inputSchema = {
  args: {},
  positionals: [
    { name: "key", description: "Credential key", required: true },
    { name: "value", description: "Credential value; leave it out to be asked for it in a masked field", required: false },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { key, value }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const [category, ...rest] = key.split(".") as [string];
  const k = rest.join(".");
  if (!k) throw new Error(`Key must be in format "category.key"`);
  // Asked for in a masked field, so the secret is not typed into the chat (and its transcript).
  const secret = value || (await agent.askForText({ message: `Enter the value for ${key}.`, label: key, masked: true }));
  if (!secret) throw new Error("No value was entered; nothing was stored");
  await agent.requireService(VaultService).setItem(category, k, secret);
  return `Stored credential: ${key}`;
}

export default {
  name: "vault store",
  description: "Store a credential",
  help: `Store a credential in the vault. Without a value, you are asked for it in a masked field, which keeps the secret out of the chat.

## Example

/vault store github.token`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
