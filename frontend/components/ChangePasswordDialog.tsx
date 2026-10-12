import PasswordInput from "@tokenring-ai/one-frontend/components/ui/PasswordInput.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { vaultRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Checkbox, Dialog, Field } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { assertMutationOk } from "../lib/vaultStatus.ts";

export const MIN_PASSWORD_LENGTH = 8;

type ChangePasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Where the password is kept between runs, e.g. "keychain". */
  passwordSource: string;
};

/**
 * Re-encrypts the vault under a new master password. The server verifies the current
 * password, rewrites the file, and updates the OS secrets-manager entry it unlocks from.
 * The confirmation is deliberate: a forgotten password means every secret is lost.
 */
export default function ChangePasswordDialog({ open, onClose, onChanged, passwordSource }: ChangePasswordDialogProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setRepeat("");
    setAcknowledged(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== next;
  const sameAsCurrent = next.length > 0 && next === current;
  const ready = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && repeat === next && !sameAsCurrent && acknowledged;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await vaultRPCClient.changePassword({ currentPassword: current, newPassword: next });
      assertMutationOk(result, "Failed to change the vault password");
      toastManager.success("Vault password changed", { duration: 4000 });
      reset();
      onChanged();
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="Change vault password"
      description="Every secret is re-encrypted with the new password."
      headerIcon={<KeyRound className="w-4 h-4 text-accent-soft" />}
      onClose={close}
      width="w-full max-w-md"
      busy={busy}
      error={error}
      tone="danger"
      confirmLabel="Change password"
      confirmDisabled={!ready}
      onConfirm={() => void submit()}
    >
      <form
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Current password" htmlFor="vault-current-password">
          <PasswordInput id="vault-current-password" value={current} onChange={setCurrent} autoFocus autoComplete="current-password" />
        </Field>
        <Field
          label="New password"
          htmlFor="vault-new-password"
          error={tooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters` : sameAsCurrent ? "The new password matches the current one" : undefined}
        >
          <PasswordInput id="vault-new-password" value={next} onChange={setNext} autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password" htmlFor="vault-repeat-password" error={mismatch ? "The passwords do not match" : undefined}>
          <PasswordInput id="vault-repeat-password" value={repeat} onChange={setRepeat} autoComplete="new-password" />
        </Field>
        <p className="text-xs text-muted">
          {passwordSource === "keychain"
            ? "The password stored in your system keychain is updated too, so TokenRing keeps unlocking the vault on start."
            : "Keep the new password safe: TokenRing asks for it the next time the vault is unlocked."}
        </p>
        <Checkbox
          id="vault-password-acknowledge"
          checked={acknowledged}
          onChange={setAcknowledged}
          label="I understand that secrets cannot be recovered without this password."
        />
        {/* Enter submits the form; the visible button lives in the dialog footer. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
