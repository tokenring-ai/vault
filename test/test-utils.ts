import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * Create a temporary directory for testing
 * @returns {string} Path to the temporary directory
 */
export function createTempFile(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
}