import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Lock } from "lucide-react";
import { VAULT_VIEW_ID } from "./layout.ts";
import VaultView from "./views/VaultView.tsx";

export default {
  views: [
    defineView({
      id: VAULT_VIEW_ID,
      kind: "page",
      title: "Vault",
      description: "Browse, add, and edit encrypted vault keys",
      icon: Lock,
      route: "",
      closable: false,
      component: VaultView,
    }),
  ],
} satisfies PluginLayoutViews;
