import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { secrets } from "bun";
import { keychainPasswordStore } from "../keychain.ts";

// `secrets` is stubbed in every test: the machine's real OS secrets manager is never read or written.
describe("keychainPasswordStore.remember", () => {
  let previousEnv: string | undefined;

  beforeEach(() => {
    previousEnv = process.env.TR_VAULT_PASSWORD;
    delete process.env.TR_VAULT_PASSWORD;
  });

  afterEach(() => {
    mock.restore();
    if (previousEnv === undefined) delete process.env.TR_VAULT_PASSWORD;
    else process.env.TR_VAULT_PASSWORD = previousEnv;
  });

  it("stores the password and reads it back", async () => {
    let held: string | null = null;
    spyOn(secrets, "set").mockImplementation((async (options: { value: string }) => {
      held = options.value;
    }) as never);
    spyOn(secrets, "get").mockImplementation((async () => held) as never);
    expect(await keychainPasswordStore.remember?.("a long enough password")).toEqual({ stored: true });
    expect(held as string | null).toBe("a long enough password");
  });

  it("reports a missing secrets manager without leaking the password or the error", async () => {
    spyOn(secrets, "set").mockRejectedValue(new Error("boom a long enough password"));
    const result = await keychainPasswordStore.remember?.("a long enough password");
    expect(result?.stored).toBe(false);
    expect(JSON.stringify(result)).not.toContain("a long enough password");
    expect(JSON.stringify(result)).not.toContain("boom");
  });

  it("reports a store that did not keep the value", async () => {
    spyOn(secrets, "set").mockResolvedValue(undefined as never);
    spyOn(secrets, "get").mockResolvedValue(null as never);
    expect((await keychainPasswordStore.remember?.("a long enough password"))?.stored).toBe(false);
  });

  it("does not store when TR_VAULT_PASSWORD is set", async () => {
    process.env.TR_VAULT_PASSWORD = "from-env";
    const set = spyOn(secrets, "set").mockResolvedValue(undefined as never);
    expect((await keychainPasswordStore.remember?.("a long enough password"))?.stored).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});
