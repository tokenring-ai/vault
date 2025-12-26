import {TokenRingPlugin} from "@tokenring-ai/app";

import {z} from "zod";
import {VaultService} from "./index.ts";
import packageJSON from "./package.json";
import {vaultConfigSchema} from "./VaultService.ts";

const packageConfigSchema = z.object({
  vault: vaultConfigSchema.optional()
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    if (config.vault) {
      app.addServices(new VaultService(config.vault));
    }
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;