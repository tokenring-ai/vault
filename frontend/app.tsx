import type { PluginFrontendContribution } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { lazy } from "react";
import manifest, { vaultViewManifest } from "./manifest.ts";

/**
 * The Vault dashboard contributed to the TokenRing One frontend by this
 * plugin: a single view of the encrypted keys, grouped by category, with
 * search and per-key actions. Discovered by
 * `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  views: [{ ...vaultViewManifest, component: lazy(() => import("./views/VaultView.tsx")) }],
  dashboards: [
    {
      ...manifest,
      routePath: "/vault",
      defaultLayout: { kind: "panel", view: vaultViewManifest.id },
      documentTitle: () => "Vault",
    },
  ],
} satisfies PluginFrontendContribution;
