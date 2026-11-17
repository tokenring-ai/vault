import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import { SecretService } from "@tokenring-ai/secrets";
import type { ZodNever } from "zod";
import { z } from "zod";
import agentCommands from "./commands.ts";
import { VaultService } from "./index.ts";
import { keychainPasswordStore, resolveVaultPassword } from "./keychain.ts";
import packageJSON from "./package.json";
import vaultRPC from "./rpc/vault.ts";
import { VaultConfigSchema } from "./schema.ts";

const packageConfigSchema = z.object({
  vault: VaultConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Credential Vault",
  version: packageJSON.version,
  description: packageJSON.description,
  async earlyInstall(app, config) {
    const vaultService = app.addService(VaultService, new VaultService(config.vault));

    // The resolver is kept so a locked vault (via /vault lock or relockTime)
    // re-reads the password from the environment / OS secrets manager on next use.
    vaultService.setPasswordResolver(resolveVaultPassword);
    vaultService.setPasswordStore(keychainPasswordStore);
    vaultService.setErrorReporter(message => app.serviceError(vaultService, message));
    // A password that does not open the vault leaves it locked (reported, not thrown) so the
    // app still boots; having no password source at all still fails here.
    await vaultService.unlockAtStartup();

    // Vault entries are read through explicit `{ source: "vault" }` config
    // references rather than being injected into the process environment.
    app.waitForService(SecretService, secretService => secretService.setStore(vaultService));

    app.waitForService(AgentCommandService, commandService => {
      commandService.addAgentCommands(agentCommands);
    });
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(vaultRPC);
    });
  },
  immutableConfigSchema: packageConfigSchema,
} satisfies TokenRingPlugin<ZodNever, typeof packageConfigSchema>;
