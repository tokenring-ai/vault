import type { AppManifest } from "@tokenring-ai/one-frontend/layout/types.ts";
import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Lock } from "lucide-react";

export const VAULT_VIEW_ID = "vault-vault";

/** Vault: one page of encrypted keys grouped by category, with search and per-key actions. Route: `/vault`. */
export const VAULT_APP: AppManifest = {
  id: "vault",
  path: "/vault",
  label: "Vault",
  shortLabel: "VA",
  description: "Manage encrypted credentials and secrets",
  group: "System",
  icon: Lock,
  iconClass: "text-amber-500",
  gradient: "from-yellow-500 to-amber-600",
  views: [VAULT_VIEW_ID],
  primaryKind: "page",
  layout: { presenter: "single", accepts: ["page"], items: [VAULT_VIEW_ID], primary: true },
};

export default { apps: [VAULT_APP], kinds: [] } satisfies PluginLayoutManifest;
