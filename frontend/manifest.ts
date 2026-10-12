import type { ViewManifest } from "@tokenring-ai/one-frontend/dock/types.ts";
import type { PluginFrontendManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { Lock } from "lucide-react";

export const VAULT_DASHBOARD_ID = "vault";

/** The one vault view: category tabs, search, and the keys of each category. */
export const vaultViewManifest = {
  id: "vault-vault",
  title: "Vault",
  description: "Browse, add, and edit encrypted vault keys",
  icon: Lock,
  availableOn: ["home", "any"],
  defaultSize: { width: 560, height: 420 },
  minimumSize: { width: 320, height: 200 },
  tags: ["security"],
} satisfies ViewManifest;

/**
 * Metadata for the vault dashboard shipped by this plugin. The frontend merges
 * this into its registry and derives the SPA server routes from it.
 */
export default {
  id: VAULT_DASHBOARD_ID,
  path: "/vault",
  label: "Vault",
  shortLabel: "VA",
  description: "Manage encrypted credentials and secrets",
  group: "System",
  icon: Lock,
  iconClass: "text-amber-500",
  gradient: "from-yellow-500 to-amber-600",
  views: [vaultViewManifest],
} satisfies PluginFrontendManifest;
