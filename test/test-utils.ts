import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

/**
 * Create a temporary directory for testing
 * @returns {string} Path to the temporary directory
 */
export function createTempFile(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vault-test-"));
}
