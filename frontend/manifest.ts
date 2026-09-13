import { Lock } from "lucide-react";
import type { PluginAppManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";

/**
 * Metadata for the vault app shipped by this plugin. The frontend merges
 * this into its app registry and derives the SPA server routes from it.
 */
export default {
  id: "vault",
  path: "/vault",
  label: "Vault",
  shortLabel: "VA",
  description: "Manage encrypted credentials and secrets",
  group: "System",
  icon: Lock,
  iconClass: "text-amber-500",
  gradient: "from-yellow-500 to-amber-600",
} satisfies PluginAppManifest;
