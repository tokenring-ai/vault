import { useRPCStreamSWR } from "@tokenring-ai/one-frontend/hooks/useRPCStreamSWR.ts";
import { vaultRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";

/** Live lock state and password-change support of the server's vault. */
export function useVaultStatus() {
  return useRPCStreamSWR({
    key: "vault-status",
    subscribe: signal => vaultRPCClient.streamStatus({}, signal),
  });
}

/** Throws the server's message when a vault mutation reports failure. */
export function assertMutationOk(result: { success: boolean; message: string }, fallback: string): void {
  if (!result.success) throw new Error(result.message || fallback);
}
