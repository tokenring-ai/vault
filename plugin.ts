import TokenRingApp, {TokenRingPlugin} from "@tokenring-ai/app";
import {VaultService} from "./index.ts";
import packageJSON from "./package.json";
import {vaultConfigSchema} from "./VaultService.ts";

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    const vaultConfig = app.getConfigSlice("vault", vaultConfigSchema.optional());

    if (vaultConfig) {
      app.addServices(new VaultService(vaultConfig));
    }
  }
} satisfies TokenRingPlugin;