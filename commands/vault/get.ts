import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.ts";

const inputSchema = {
  args: {},
  positionals: [{name: "key", description: "Credential key", required: true}],
} as const satisfies AgentCommandInputSchema;

async function execute({
                         positionals: {key},
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const [category, ...rest] = key.split(".");
  const k = rest.join(".");
  if (!k) throw new CommandFailedError(`Key must be in format "category.key"`);
  const value = await agent
    .requireServiceByType(VaultService)
    .getItem(category, k, agent);
  if (value === undefined)
    throw new CommandFailedError(`Credential "${key}" not found in vault`);
  return `${key}: ${value}`;
}

export default {
  name: "vault get",
  description: "Retrieve a credential",
  help: `Retrieve and display a credential from the vault.

## Example

/vault get api_key`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
