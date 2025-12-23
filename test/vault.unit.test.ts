import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { 
  encrypt, 
  decrypt, 
  readVault, 
  writeVault, 
  initVault,
  deriveKey 
} from '../vault.ts';
import { createTempFile } from './test-utils.js';

describe('Vault Core Functions', () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(() => {
    tempDir = createTempFile();
    tempFile = `${tempDir}/test.vault`;
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.clearAllMocks();
  });

  describe('deriveKey', () => {
    it('should derive consistent keys from same password and salt', () => {
      const password = 'test-password';
      const salt = Buffer.from('1234567890123456');
      
      const key1 = deriveKey(password, salt);
      const key2 = deriveKey(password, salt);
      
      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32); // 256 bits
    });

    it('should derive different keys for different passwords', () => {
      const salt = Buffer.from('1234567890123456');
      const password1 = 'password1';
      const password2 = 'password2';
      
      const key1 = deriveKey(password1, salt);
      const key2 = deriveKey(password2, salt);
      
      expect(key1).not.toEqual(key2);
    });

    it('should derive different keys for different salts', () => {
      const password = 'test-password';
      const salt1 = Buffer.from('1234567890123456');
      const salt2 = Buffer.from('6543210987654321');
      
      const key1 = deriveKey(password, salt1);
      const key2 = deriveKey(password, salt2);
      
      expect(key1).not.toEqual(key2);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const originalData = 'test-secret-data';
      const password = 'test-password';
      
      const encrypted = encrypt(originalData, password);
      const decrypted = decrypt(encrypted, password);
      
      expect(decrypted).toBe(originalData);
      expect(encrypted).not.toBe(originalData);
    });

    it('should produce different encrypted data for same input with different passwords', () => {
      const originalData = 'test-data';
      const encrypted1 = encrypt(originalData, 'password1');
      const encrypted2 = encrypt(originalData, 'password2');
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error on decrypt with wrong password', () => {
      const originalData = 'test-data';
      const encrypted = encrypt(originalData, 'correct-password');
      
      expect(() => {
        decrypt(encrypted, 'wrong-password');
      }).toThrow();
    });

    it('should handle empty data', () => {
      const password = 'test-password';
      const encrypted = encrypt('', password);
      const decrypted = decrypt(encrypted, password);
      
      expect(decrypted).toBe('');
    });

    it('should handle large data', () => {
      const largeData = 'a'.repeat(10000);
      const password = 'test-password';
      
      const encrypted = encrypt(largeData, password);
      const decrypted = decrypt(encrypted, password);
      
      expect(decrypted).toBe(largeData);
    });
  });

  describe('readVault', () => {
    it('should throw error when vault file does not exist', async () => {
      await expect(readVault('non-existent-file.vault', 'password'))
        .rejects.toThrow('Vault file does not exist');
    });

    it('should read and parse vault data correctly', async () => {
      const testData = {
        'key1': 'value1',
        'key2': 'value2',
        'key3': 'value3'
      };
      
      await writeVault(tempFile, 'password', testData);
      const readData = await readVault(tempFile, 'password');
      
      expect(readData).toEqual(testData);
    });

    it('should throw error on invalid encrypted data', async () => {
      await fs.writeFile(tempFile, 'invalid-encrypted-data');
      
      await expect(readVault(tempFile, 'password'))
        .rejects.toThrow();
    });

    it('should handle empty vault data', async () => {
      await writeVault(tempFile, 'password', {});
      const readData = await readVault(tempFile, 'password');
      
      expect(readData).toEqual({});
    });
  });

  describe('writeVault', () => {
    it('should write vault data correctly', async () => {
      const testData = {
        'api-key': 'secret-key',
        'database-url': 'postgres://localhost/test'
      };
      
      await writeVault(tempFile, 'password', testData);
      
      const fileExists = await fs.pathExists(tempFile);
      expect(fileExists).toBe(true);
      
      const readData = await readVault(tempFile, 'password');
      expect(readData).toEqual(testData);
    });

    it('should set correct file permissions', async () => {
      await writeVault(tempFile, 'password', { test: 'data' });
      
      const stats = await fs.stat(tempFile);
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o600);
    });
  });

  describe('initVault', () => {
    it('should initialize empty vault', async () => {
      await initVault(tempFile, 'password');
      
      const readData = await readVault(tempFile, 'password');
      expect(readData).toEqual({});
    });

    it('should create vault file if it does not exist', async () => {
      await initVault(tempFile, 'password');
      
      const fileExists = await fs.pathExists(tempFile);
      expect(fileExists).toBe(true);
    });
  });
});