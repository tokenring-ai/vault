import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { MIN_VAULT_PASSWORD_LENGTH } from "../../schema.ts";
import VaultService from "../../VaultService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "vault setup",
  description: "Create the vault with a password you choose",
  help: `Create the vault: an encrypted file on this computer that keeps your keys and tokens. You are asked for a password twice, in masked fields, so it stays out of the chat. The password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters and cannot be recovered if you forget it. TokenRing then tries to save it in your computer's secure password store so it unlocks by itself next time; on a server, set TR_VAULT_PASSWORD instead.

## Example

/vault setup`,
  inputSchema,
  execute: async ({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    const vault = agent.requireService(VaultService);
    if (vault.vaultFileExists()) {
      throw new Error(vault.unlocked ? "A vault is already set up and unlocked." : "A vault is already set up. Run /vault unlock to open it.");
    }
    const password = await agent.askForText({
      message: `Choose a vault password (at least ${MIN_VAULT_PASSWORD_LENGTH} characters). It cannot be recovered if you forget it.`,
      label: "New vault password",
      masked: true,
    });
    if (!password) throw new Error("Vault setup cancelled; no vault was created.");
    if (password.length < MIN_VAULT_PASSWORD_LENGTH)
      throw new Error(`The vault password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters. No vault was created.`);
    const confirmation = await agent.askForText({ message: "Type the vault password again to confirm it.", label: "Confirm vault password", masked: true });
    if (confirmation !== password) throw new Error("The two passwords did not match. No vault was created.");
    return (await vault.createVault(password)).message;
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
