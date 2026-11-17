import crypto from "node:crypto";
import { secrets } from "bun";
import type { VaultPasswordStore } from "./VaultService.ts";

/**
 * Where the app keeps the vault password: TR_VAULT_PASSWORD, else the OS secrets manager. Shared by
 * the server plugin and the `vault` CLI, so a password changed from either keeps the two in step.
 */
const SECRETS_SERVICE = "tokenring";
const SECRETS_NAME = "vault-password";

/**
 * Resolve the vault password without prompting.
 * Preference order:
 * 1. TR_VAULT_PASSWORD environment variable
 * 2. System secrets manager (auto-generate and store if missing)
 */
export async function resolveVaultPassword(): Promise<string> {
  const fromEnv = process.env.TR_VAULT_PASSWORD;
  if (fromEnv) {
    return fromEnv;
  }

  try {
    const existing = await secrets.get({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
    });
    if (existing) {
      return existing;
    }

    // Secrets manager is available but no key is stored yet — generate one.
    const generated = crypto.randomBytes(32).toString("base64url");
    await secrets.set({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
      value: generated,
    });
    return generated;
  } catch {
    // Secrets manager is not available on this platform.
  }

  throw new Error(
    "Vault is required but no password is available. " + "Set the TR_VAULT_PASSWORD environment variable, or run on a system with a secrets manager.",
  );
}

/**
 * The OS secrets-manager entry `resolveVaultPassword` reads. A password set through
 * TR_VAULT_PASSWORD cannot be changed from a running server (the next start would read
 * the old value from the environment), so changes are refused in that case.
 */
export const keychainPasswordStore: VaultPasswordStore = {
  describe() {
    if (process.env.TR_VAULT_PASSWORD) {
      return {
        source: "environment",
        canUpdate: false,
        reason:
          "The vault password comes from the TR_VAULT_PASSWORD environment variable. Change it with `vault change-password`, then update the variable and restart.",
      };
    }
    return { source: "keychain", canUpdate: true };
  },
  async remember(password) {
    if (process.env.TR_VAULT_PASSWORD) {
      return { stored: false, reason: "the password comes from the TR_VAULT_PASSWORD environment variable" };
    }
    try {
      await secrets.set({ service: SECRETS_SERVICE, name: SECRETS_NAME, value: password });
      if ((await secrets.get({ service: SECRETS_SERVICE, name: SECRETS_NAME })) !== password) {
        return { stored: false, reason: "the secure password store did not keep it" };
      }
      return { stored: true };
    } catch {
      return { stored: false, reason: "this computer has no secure password store that TokenRing can use" };
    }
  },
  async update(currentPassword, newPassword) {
    if (process.env.TR_VAULT_PASSWORD) throw new Error("TR_VAULT_PASSWORD is set; the environment cannot be updated from here");
    let stored: string | null;
    try {
      stored = await secrets.get({ service: SECRETS_SERVICE, name: SECRETS_NAME });
    } catch {
      // No secrets manager on this platform: the password was typed in, nothing is stored.
      return;
    }
    // Only replace the entry this vault was opened with; anything else is not ours to touch.
    if (stored !== currentPassword) return;
    await secrets.set({ service: SECRETS_SERVICE, name: SECRETS_NAME, value: newPassword });
  },
};
