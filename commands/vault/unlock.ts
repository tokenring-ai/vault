import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { VAULT_NOT_SET_UP_MESSAGE } from "@tokenring-ai/secrets/SecretService";
import VaultService from "../../VaultService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "vault unlock",
  description: "Unlock the vault",
  help: `Unlock the vault with a password prompt. If no vault exists yet, use /vault setup to create one.

## Example

/vault unlock`,
  inputSchema,
  execute: async ({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    const vault = agent.requireService(VaultService);
    if (!vault.unlocked && !vault.vaultFileExists()) {
      // Nothing to unlock: the saved password may still create one by itself, otherwise point at setup.
      await vault.unlockExisting().catch(() => {
        throw new Error(VAULT_NOT_SET_UP_MESSAGE);
      });
      return "Vault unlocked successfully";
    }
    await vault.unlock(agent);
    return "Vault unlocked successfully";
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
