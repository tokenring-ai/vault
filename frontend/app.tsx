import manifest from "./manifest.ts";
import VaultApp from "./VaultApp.tsx";
import type { PluginAppDefinition } from "@tokenring-ai/one-frontend/plugins/types.ts";

/**
 * The vault app contributed to the TokenRing One frontend by this
 * plugin. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  routePath: "/vault",
  component: VaultApp,
} satisfies PluginAppDefinition;
