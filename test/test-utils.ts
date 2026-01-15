import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

/**
 * Create a temporary directory for testing
 * @returns {string} Path to the temporary directory
 */
export function createTempFile(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
}

/**
 * Create a mock password for testing
 * @param {string} password - The password to mock
 * @returns {string} The mocked password
 */
export function createMockPassword(password = 'test-password'): string {
  return password;
}

/**
 * Mock the agent.askHuman method for testing
 */
export function createMockAgent() {
  return {
    askHuman: vi.fn().mockResolvedValue('test-password'),
    infoMessage: vi.fn(),
    errorMessage: vi.fn(),
    generateCheckpoint: vi.fn(),
  };
}

/**
 * Clean up test files
 */
export async function cleanupTestFiles(tempDir?: string) {
  if (tempDir && await fs.pathExists(tempDir)) {
    await fs.remove(tempDir);
  }
}