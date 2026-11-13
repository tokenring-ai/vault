import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import PasswordInput from "@tokenring-ai/one-frontend/components/ui/PasswordInput.tsx";
import SearchInput from "@tokenring-ai/one-frontend/components/ui/SearchInput.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useCopyToClipboard } from "@tokenring-ai/one-frontend/hooks/useCopyToClipboard.ts";
import { useEntityDelete } from "@tokenring-ai/one-frontend/hooks/useEntityDelete.ts";
import { useRevealSecret } from "@tokenring-ai/one-frontend/hooks/useRevealSecret.ts";
import { useVaultKeys, vaultRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button, IconButton, Select, TextField } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import {
  ArrowRightLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ChangePasswordDialog from "../components/ChangePasswordDialog.tsx";
import { CLIPBOARD_CLEAR_MS, scheduleClipboardClear } from "../lib/clipboardAutoClear.ts";
import { assertMutationOk, useVaultStatus } from "../lib/vaultStatus.ts";

// ─── Categories ───────────────────────────────────────────────────────────────

/** Well-known category labels (any other category id is shown as-is). */
const CATEGORY_LABELS: Record<string, string> = {
  env: "Environment Variables",
  token: "Stored Auth Tokens",
};

const DEFAULT_CATEGORIES = ["env", "token"] as const;

function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? id;
}

/** Merge known defaults with whatever the vault currently contains. */
function resolveCategories(entries: Record<string, string[] | undefined>): string[] {
  const set = new Set<string>([...DEFAULT_CATEGORIES, ...Object.keys(entries)]);
  return Array.from(set).sort((a, b) => {
    const ai = (DEFAULT_CATEGORIES as readonly string[]).indexOf(a);
    const bi = (DEFAULT_CATEGORIES as readonly string[]).indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

// ─── Key row ──────────────────────────────────────────────────────────────────

type KeyRowProps = {
  category: string;
  keyName: string;
  /** Every category's key names, to offer move targets and warn before overwriting. */
  entries: Record<string, string[] | undefined>;
  categories: readonly string[];
  onDeleted: () => void;
  onSaved: () => void;
};

function KeyRow({ category, keyName, entries, categories, onDeleted, onSaved }: KeyRowProps) {
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveKey, setMoveKey] = useState(keyName);
  const [moveCategory, setMoveCategory] = useState(category);
  const [movingBusy, setMovingBusy] = useState(false);
  const { openConfirm, Dialog: OverwriteDialog } = useConfirmDialog();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { copy, copied } = useCopyToClipboard({ showToast: true, feedbackDuration: 1500 });

  // Reveal existing secret (fetched on demand — list RPC only returns keys)
  const secret = useRevealSecret({
    fetchSecret: async () => {
      const result = await vaultRPCClient.getItem({ category, key: keyName });
      if (!result.found || result.value === undefined) {
        throw new Error(`"${keyName}" not found in vault`);
      }
      return result.value;
    },
    autoHideMs: 30_000,
    onError: err => {
      toastManager.error(formatError(err), { duration: 5000 });
    },
  });

  const cancelEdit = () => {
    setEditing(false);
    setValue("");
  };

  const entityDelete = useEntityDelete({
    // Vault keys are not route-scoped; no navigation needed after delete.
    currentRouteId: null,
    navigateToOverview: () => {},
    refreshList: onDeleted,
    clearLocalState: () => {
      secret.hide();
      cancelEdit();
    },
    successMessage: name => `"${name}" deleted`,
  });

  const handleCopy = async () => {
    const text = await secret.fetchForClipboard();
    if (text == null) return;
    // Secrets do not linger: the clipboard is wiped after 30s if it still holds this value.
    if (await copy(text)) scheduleClipboardClear(text, CLIPBOARD_CLEAR_MS);
  };

  const startMove = () => {
    setMoveKey(keyName);
    setMoveCategory(category);
    setMoving(true);
    setEditing(false);
    setConfirmDelete(false);
  };

  const handleMove = async () => {
    const targetKey = moveKey.trim();
    if (!targetKey) return;
    if (targetKey === keyName && moveCategory === category) {
      setMoving(false);
      return;
    }
    const overwrite = entries[moveCategory]?.includes(targetKey) ?? false;
    if (overwrite) {
      const confirmed = await openConfirm({
        title: "Overwrite key?",
        message: `"${targetKey}" already exists in ${categoryLabel(moveCategory)}. Moving "${keyName}" there replaces its value.`,
        confirmText: "Overwrite",
        variant: "danger",
        dontAskAgain: false,
      });
      if (!confirmed) return;
    }
    setMovingBusy(true);
    try {
      const result = await vaultRPCClient.moveItem({
        from: { category, key: keyName },
        to: { category: moveCategory, key: targetKey },
        overwrite,
      });
      assertMutationOk(result, "Failed to move key");
      toastManager.success(moveCategory === category ? `Renamed to "${targetKey}"` : `Moved to ${categoryLabel(moveCategory)}`, { duration: 3000 });
      setMoving(false);
      secret.hide();
      onSaved();
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setMovingBusy(false);
    }
  };

  const handleSave = async () => {
    if (!value) return;
    setSaving(true);
    try {
      const result = await vaultRPCClient.setItems({ updates: [{ category, key: keyName, value }] });
      assertMutationOk(result, "Failed to save key");
      toastManager.success(`"${keyName}" saved`, { duration: 3000 });
      cancelEdit();
      secret.hide();
      onSaved();
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    await entityDelete.deleteEntity(keyName, keyName, async () => {
      const result = await vaultRPCClient.deleteItems({ updates: [{ category, key: keyName }] });
      assertMutationOk(result, "Failed to delete key");
    });
  };

  const deleting = entityDelete.isDeleting;

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-primary last:border-b-0">
      <div className="flex items-center gap-3">
        <KeyRound className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className="flex-1 text-sm font-mono text-primary truncate" title={keyName}>
          {keyName}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && !moving && (
            <>
              <button
                type="button"
                onClick={() => void secret.toggleReveal()}
                disabled={secret.loading}
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer disabled:opacity-50"
                title={secret.revealed ? "Hide value" : "Show value"}
                aria-label={secret.revealed ? "Hide value" : "Show value"}
              >
                {secret.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : secret.revealed ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={secret.loading}
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer disabled:opacity-50"
                title="Copy value (the clipboard clears after 30 seconds)"
                aria-label="Copy value"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setConfirmDelete(false);
                  secret.hide();
                  setValue("");
                }}
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer"
                title="Update value"
                aria-label="Update value"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={startMove}
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer"
                title="Rename or move to another category"
                aria-label={`Rename or move ${keyName}`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-500 font-medium truncate max-w-48" title={`Delete ${keyName}?`}>
                Delete <span className="font-mono">{keyName}</span>?
              </span>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                aria-label={`Confirm delete ${keyName}`}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded-md cursor-pointer disabled:opacity-50 focus-ring"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer"
                aria-label="Cancel delete"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            !editing &&
            !moving && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="p-1.5 text-muted hover:text-red-500 transition-colors rounded-md focus-ring cursor-pointer"
                title="Delete key"
                aria-label="Delete key"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {secret.revealed && secret.value != null && !editing && (
        <div className="pl-6">
          <div className="bg-input border border-primary rounded-lg px-3 py-2 font-mono text-xs text-primary break-all select-all">{secret.value}</div>
        </div>
      )}

      {moving && (
        <form
          className="flex flex-wrap items-end gap-2 pl-6"
          aria-label={`Rename or move ${keyName}`}
          onSubmit={event => {
            event.preventDefault();
            void handleMove();
          }}
        >
          <TextField
            label="Key name"
            value={moveKey}
            onChange={setMoveKey}
            mono
            autoFocus
            className="flex-1 min-w-40"
            onKeyDown={event => {
              if (event.key === "Escape") setMoving(false);
            }}
          />
          <Select label="Category" value={moveCategory} onChange={setMoveCategory} className="w-44">
            {categories.map(id => (
              <option key={id} value={id}>
                {categoryLabel(id)}
              </option>
            ))}
          </Select>
          <IconButton type="submit" label="Apply rename or move" icon={Check} busy={movingBusy} disabled={!moveKey.trim()} />
          <IconButton type="button" variant="ghost" label="Cancel rename" icon={X} onClick={() => setMoving(false)} />
        </form>
      )}

      {editing && (
        <div className="flex items-center gap-2 pl-6">
          <PasswordInput
            className="flex-1"
            placeholder="New value..."
            value={value}
            onChange={setValue}
            onKeyDown={e => {
              if (e.key === "Enter") void handleSave();
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            aria-label="New value"
          />
          <IconButton label="Save" icon={Save} busy={saving} disabled={!value} onClick={() => void handleSave()} />
          <button
            type="button"
            onClick={cancelEdit}
            className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer"
            aria-label="Cancel edit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <OverwriteDialog />
    </div>
  );
}

// ─── Add key form ─────────────────────────────────────────────────────────────

function AddKeyForm({ category, existingKeys, onAdded }: { category: string; existingKeys: readonly string[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setKey("");
    setValue("");
    setOpen(false);
  };

  // setItems overwrites silently, so say so before the user saves over an existing key.
  const overwrites = existingKeys.includes(key.trim());

  const handleSave = async () => {
    if (!key.trim() || !value) return;
    setSaving(true);
    try {
      const result = await vaultRPCClient.setItems({ updates: [{ category, key: key.trim(), value }] });
      assertMutationOk(result, "Failed to add key");
      toastManager.success(overwrites ? `"${key.trim()}" overwritten` : `"${key.trim()}" added`, { duration: 3000 });
      resetForm();
      onAdded();
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-xs text-muted hover:text-primary hover:bg-hover transition-colors border-t border-primary cursor-pointer focus-ring"
      >
        <Plus className="w-3.5 h-3.5" /> Add new key
      </button>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-primary space-y-2">
      <input
        type="text"
        placeholder="Key name"
        value={key}
        onChange={e => setKey(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape") resetForm();
        }}
        autoFocus
        className="w-full bg-input border border-primary rounded-lg py-1.5 px-3 text-xs text-primary placeholder-muted focus-accent font-mono"
      />
      <div className="flex items-center gap-2">
        <PasswordInput
          className="flex-1"
          placeholder="Value"
          value={value}
          onChange={setValue}
          onKeyDown={e => {
            if (e.key === "Enter") void handleSave();
            if (e.key === "Escape") resetForm();
          }}
          aria-label="Value"
        />
        <IconButton label="Save" icon={Save} busy={saving} disabled={!key.trim() || !value} onClick={() => void handleSave()} />
        <button
          type="button"
          onClick={resetForm}
          className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring cursor-pointer"
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {overwrites && (
        <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
          <span className="font-mono">{key.trim()}</span> already exists. Saving will overwrite its current value.
        </p>
      )}
    </div>
  );
}

// ─── Bulk import modal ────────────────────────────────────────────────────────

function BulkImportModal({
  category,
  categoryLabel: label,
  existingKeys,
  onClose,
  onImported,
}: {
  category: string;
  categoryLabel: string;
  existingKeys: readonly string[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  // Escape closes the modal (same pattern as OpenDocumentModal and other dialogs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, importing]);

  const parseEntries = (raw: string) => {
    const entries: { key: string; value: string }[] = [];
    const seen = new Set<string>();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      // Allow empty values to be skipped; vault schema requires minLength 1
      let value = trimmed.slice(eqIdx + 1);
      // Strip optional surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!key || !value || seen.has(key)) continue;
      seen.add(key);
      entries.push({ key, value });
    }
    return entries;
  };

  const preview = parseEntries(text);
  const overwriteCount = preview.filter(({ key }) => existingKeys.includes(key)).length;

  const handleImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    try {
      const result = await vaultRPCClient.setItems({
        updates: preview.map(({ key, value }) => ({ category, key, value })),
      });
      assertMutationOk(result, "Failed to import keys");
      toastManager.success(`Imported ${preview.length} key${preview.length !== 1 ? "s" : ""} into "${label}"`, {
        duration: 4000,
      });
      onImported();
      onClose();
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-lg bg-secondary border border-primary rounded-xl shadow-2xl flex flex-col gap-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-import-title"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-primary">
          <Upload className="w-4 h-4 text-accent-soft shrink-0" />
          <div className="flex-1 min-w-0">
            <p id="bulk-import-title" className="text-sm font-semibold text-primary">
              Bulk Import
            </p>
            <p className="text-xs text-muted">Into: {label}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-muted hover:text-primary transition-colors rounded-md focus-ring" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-2">
          <p className="text-xs text-muted">
            Paste <span className="font-mono">KEY=value</span> pairs, one per line. Lines starting with <span className="font-mono">#</span> are ignored.
            Optional quotes around values are stripped.
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'API_KEY=abc123\nSECRET_TOKEN="xyz789"\n# this is a comment'}
            rows={8}
            className="w-full bg-input border border-primary rounded-lg py-2 px-3 text-xs text-primary placeholder-muted font-mono resize-none focus-accent"
          />
        </div>

        {preview.length > 0 && (
          <div className="mx-4 mb-3 bg-input border border-primary rounded-lg overflow-hidden">
            <p className="px-3 py-1.5 text-xs text-muted border-b border-primary">
              {preview.length} key{preview.length !== 1 ? "s" : ""} detected
            </p>
            {overwriteCount > 0 && (
              <p role="status" className="px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 border-b border-primary">
                Will overwrite {overwriteCount} existing key{overwriteCount !== 1 ? "s" : ""} in {label}.
              </p>
            )}
            <div className="max-h-32 overflow-y-auto">
              {preview.map(({ key }) => (
                <div key={key} className="flex items-center gap-2 px-3 py-1 border-b border-primary last:border-b-0">
                  <KeyRound className="w-3 h-3 text-muted shrink-0" />
                  <span className="text-xs font-mono text-primary truncate">{key}</span>
                  {existingKeys.includes(key) && <span className="ml-auto shrink-0 text-xs text-amber-600 dark:text-amber-400">overwrites</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-primary">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon={Upload} busy={importing} disabled={!preview.length} onClick={() => void handleImport()}>
            Import {preview.length > 0 ? `${preview.length} key${preview.length !== 1 ? "s" : ""}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  label,
  keys = [],
  entries,
  categories,
  search,
  onMutate,
}: {
  category: string;
  label: string;
  keys: string[] | undefined;
  entries: Record<string, string[] | undefined>;
  categories: readonly string[];
  search: string;
  onMutate: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? keys.filter(k => k.toLowerCase().includes(q)) : keys;
    return [...list].sort((a, b) => a.localeCompare(b));
  }, [keys, search]);

  return (
    <>
      {importOpen && (
        <BulkImportModal category={category} categoryLabel={label} existingKeys={keys} onClose={() => setImportOpen(false)} onImported={onMutate} />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</h2>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-primary border border-primary rounded-md hover:bg-hover transition-colors cursor-pointer focus-ring"
            title="Bulk import KEY=value pairs"
          >
            <Upload className="w-3 h-3" /> Import
          </button>
        </div>

        <div className="bg-secondary border border-primary rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
              <KeyRound className="w-6 h-6 text-muted opacity-30" />
              <p className="text-xs text-muted">{search ? `No keys matching "${search}"` : "No keys stored"}</p>
            </div>
          ) : (
            filtered.map(k => (
              <KeyRow key={k} category={category} keyName={k} entries={entries} categories={categories} onDeleted={onMutate} onSaved={onMutate} />
            ))
          )}
          <AddKeyForm category={category} existingKeys={keys} onAdded={onMutate} />
        </div>

        <p className="text-xs text-muted text-right">
          {keys.length} key{keys.length !== 1 ? "s" : ""}
          {search.trim() && filtered.length !== keys.length ? ` · ${filtered.length} shown` : ""}
        </p>
      </div>
    </>
  );
}

// ─── New category ─────────────────────────────────────────────────────────────

function NewCategoryForm({ existing, onCreated }: { existing: readonly string[]; onCreated: (category: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const duplicate = existing.includes(trimmed);

  const close = () => {
    setName("");
    setOpen(false);
  };

  const create = async () => {
    if (!trimmed || duplicate) return;
    setBusy(true);
    try {
      const result = await vaultRPCClient.createCategory({ category: trimmed });
      assertMutationOk(result, "Failed to create category");
      toastManager.success(`Category "${trimmed}" created`, { duration: 3000 });
      close();
      onCreated(trimmed);
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto flex items-center gap-1 px-2 py-1 mb-1 text-xs text-muted hover:text-primary rounded-md hover:bg-hover transition-colors cursor-pointer focus-ring whitespace-nowrap"
        title="Create a category"
      >
        <FolderPlus className="w-3.5 h-3.5" /> New category
      </button>
    );
  }

  return (
    <form
      className="ml-auto flex items-center gap-1 mb-1"
      aria-label="New category"
      onSubmit={event => {
        event.preventDefault();
        void create();
      }}
    >
      <TextField
        aria-label="Category name"
        placeholder="Category name"
        value={name}
        onChange={setName}
        mono
        autoFocus
        maxLength={64}
        className="w-40"
        {...(duplicate && { error: "Already exists" })}
        onKeyDown={event => {
          if (event.key === "Escape") close();
        }}
      />
      <IconButton type="submit" label="Create category" icon={Check} busy={busy} disabled={!trimmed || duplicate} />
      <IconButton type="button" variant="ghost" label="Cancel new category" icon={X} onClick={close} />
    </form>
  );
}

// ─── Locked state ─────────────────────────────────────────────────────────────

function LockedVault({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async (withPassword: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await vaultRPCClient.unlock(withPassword ? { password } : {});
      assertMutationOk(result, "Failed to unlock the vault");
      setPassword("");
      onUnlocked();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4 space-y-4" data-testid="vault-locked">
      <EmptyState
        icon={Lock}
        title="Vault locked"
        hint="Decrypted secrets were dropped from memory. Config fields that read from the vault resolve to nothing until it is unlocked."
        variant="page"
      />
      <Button type="button" icon={LockOpen} busy={busy} fullWidth onClick={() => void unlock(false)}>
        Unlock with saved password
      </Button>
      <form
        className="flex items-end gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (password) void unlock(true);
        }}
      >
        <div className="flex-1 min-w-0">
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Or type the vault password"
            aria-label="Vault password"
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!password || busy}>
          Unlock
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Vault view ───────────────────────────────────────────────────────────────

/**
 * The Vault dashboard's single view: encrypted keys grouped by category, with
 * search in the header and add/reveal/copy/edit/rename/move/delete/bulk-import
 * per key, plus lock and master-password controls.
 * Rendered as a layout page; it takes no URL params.
 */
export default function VaultView() {
  const vault = useVaultKeys();
  const status = useVaultStatus();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [locking, setLocking] = useState(false);

  const entries = vault.data ?? {};
  const categories = useMemo(() => resolveCategories(entries), [entries]);
  // Keep tab selection valid when categories change (e.g. last key in a custom category deleted)
  const activeTab = activeCategory && !categories.includes(activeCategory) ? null : activeCategory;
  const displayedCategories = activeTab ? categories.filter(c => c === activeTab) : categories;
  const totalKeys = Object.values(entries).reduce((sum, keys) => sum + keys.length, 0);
  // Unknown (status not loaded yet) counts as unlocked so the keys render as before.
  const locked = status.data?.unlocked === false;

  const refresh = () => {
    void vault.mutate();
    void status.mutate();
  };

  const lockNow = async () => {
    setLocking(true);
    try {
      const result = await vaultRPCClient.lock({});
      assertMutationOk(result, "Failed to lock the vault");
      toastManager.success("Vault locked", { duration: 3000 });
      refresh();
    } catch (err) {
      toastManager.error(formatError(err), { duration: 5000 });
    } finally {
      setLocking(false);
    }
  };

  const headerActions = [
    {
      icon: <RefreshCw className={`w-3.5 h-3.5 ${vault.isValidating ? "animate-spin" : ""}`} />,
      label: "Refresh vault",
      onClick: refresh,
    },
    ...(locked
      ? []
      : [
          {
            icon: <KeyRound className="w-3.5 h-3.5" />,
            label: "Change master password",
            title: status.data?.canChangePassword === false ? status.data.reason : "Change master password",
            disabled: status.data?.canChangePassword === false,
            onClick: () => setPasswordDialogOpen(true),
          },
          {
            icon: locking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />,
            label: "Lock now",
            title: "Lock now: drop decrypted secrets from server memory",
            disabled: locking,
            onClick: () => void lockNow(),
          },
        ]),
  ];

  return (
    <ViewShell
      scroll={false}
      header={
        <ViewHeader
          title="Vault"
          subtitle={locked ? "Locked" : "Manage encrypted credentials and secrets"}
          icon={Lock}
          iconGradient="from-yellow-500 to-amber-600"
          middle={
            locked ? undefined : (
              <SearchInput value={search} onChange={setSearch} placeholder="Search keys..." aria-label="Search vault keys" className="w-full max-w-xs" />
            )
          }
          actions={headerActions}
        />
      }
    >
      {locked ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LockedVault onUnlocked={refresh} />
        </div>
      ) : (
        <>
          {/* Category tabs */}
          <div className="shrink-0 flex items-end gap-1 px-3 pt-2 border-b border-primary overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === null ? "text-primary border-accent" : "text-muted border-transparent hover:text-primary"
              }`}
            >
              All
            </button>
            {categories.map(id => (
              <button
                type="button"
                key={id}
                onClick={() => setActiveCategory(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === id ? "text-primary border-accent" : "text-muted border-transparent hover:text-primary"
                }`}
              >
                {categoryLabel(id)}
                {(entries[id]?.length ?? 0) > 0 && <span className="ml-1.5 text-xs text-muted tabular-nums">{entries[id]!.length}</span>}
              </button>
            ))}
            <NewCategoryForm
              existing={categories}
              onCreated={category => {
                setActiveCategory(category);
                void vault.mutate();
              }}
            />
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {vault.isLoading ? (
              <LoadingState message="Loading vault…" className="py-16" />
            ) : vault.error ? (
              <ErrorState title="Failed to load vault" error={vault.error} onRetry={() => void vault.mutate()} variant="page" />
            ) : (
              <div className="max-w-2xl mx-auto py-4 px-3 space-y-5">
                {totalKeys === 0 && (
                  <div className="flex gap-3 bg-secondary border border-primary rounded-xl px-4 py-3" data-testid="vault-intro">
                    <Lock className="w-5 h-5 text-muted shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-muted">
                      <p className="text-sm font-medium text-primary">Your vault is empty</p>
                      <p>
                        The vault keeps API keys, tokens and other secrets encrypted on this machine, so they never sit in plain-text config files. Add a key
                        below or bulk-import a <span className="font-mono">.env</span> file.
                      </p>
                      <p>
                        Configuration fields read a secret by reference (<span className="font-mono">source: vault</span> with its category and key). Set those
                        up in{" "}
                        <Link to="/configuration" className="underline hover:text-primary focus-ring rounded">
                          Configuration
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                )}

                {/* Category sections (the default categories are always present) */}
                {displayedCategories.map(id => (
                  <CategorySection
                    key={id}
                    category={id}
                    label={categoryLabel(id)}
                    keys={entries[id]}
                    entries={entries}
                    categories={categories}
                    search={search}
                    onMutate={() => vault.mutate()}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        onChanged={refresh}
        passwordSource={status.data?.passwordSource ?? "session"}
      />
    </ViewShell>
  );
}
