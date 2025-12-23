import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { createTempFile } from './test-utils.js';
import { setTimeout } from 'timers/promises';

describe('Vault CLI Integration', () => {
  let tempDir: string;
  let vaultFile: string;

  beforeEach(() => {
    tempDir = createTempFile();
    vaultFile = path.join(tempDir, 'test.vault');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  function runCommand(command: string, args: string[], password?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise( async (resolve) => {
      const child = spawn('bun', [path.join(__dirname, '../cli.ts'), command, ...args, '--file', vaultFile], {
        cwd: __dirname,
        env: { ...process.env, BUNDLE_ALLOW_RUNTIME: '1' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        stdout = stdout.trim().replace(/Enter vault password:/, '');
        resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
      });


      if (password) {
        // Handle multiple password prompts by splitting by newline
        const passwords = password.split('\n');
        for (const p of passwords) {
          await setTimeout(100);
          child.stdin.write(p + '\n');
        }

        await setTimeout(100);
        // We don't end stdin here because we might need it for multiple prompts
        // but since we are in non-TTY mode, child.stdin.write should be enough
        // and we can end it after all passwords are sent if we know how many
        child.stdin.end();
      }
    });
  }

  describe('init command', () => {
    it('should initialize a new vault', async () => {
      const result = await runCommand('init', [], 'test-password');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Vault initialized');
      
      const fileExists = await fs.pathExists(vaultFile);
      expect(fileExists).toBe(true);
    });
  });

  describe('set command', () => {
    beforeEach(async () => {
      await runCommand('init', [], 'test-password');
    });

    it('should set a key-value pair', async () => {
      const result = await runCommand('set', ['test-key', 'test-value'], 'test-password');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Set test-key');
    });

    it('should handle multiple key-value pairs', async () => {
      await runCommand('set', ['key1', 'value1'], 'test-password');
      await runCommand('set', ['key2', 'value2'], 'test-password');
      
      const result = await runCommand('get', ['key1'], 'test-password');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('value1');
    });
  });

  describe('get command', () => {
    beforeEach(async () => {
      await runCommand('init', [], 'test-password');
      await runCommand('set', ['test-key', 'test-value'], 'test-password');
    });

    it('should retrieve existing key', async () => {
      const result = await runCommand('get', ['test-key'], 'test-password');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test-value');
    });

    it('should handle non-existing key', async () => {
      const result = await runCommand('get', ['non-existing-key'], 'test-password');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('');
    });
  });

  describe('list command', () => {
    beforeEach(async () => {
      await runCommand('init', [], 'test-password');
      await runCommand('set', ['key1', 'value1'], 'test-password');
      await runCommand('set', ['key2', 'value2'], 'test-password');
      await runCommand('set', ['key3', 'value3'], 'test-password');
    });

    it('should list all keys', async () => {
      const result = await runCommand('list', [], 'test-password');
      
      expect(result.exitCode).toBe(0);
      const keys = result.stdout.trim().split('\n');
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('remove command', () => {
    beforeEach(async () => {
      await runCommand('init', [], 'test-password');
      await runCommand('set', ['test-key', 'test-value'], 'test-password');
    });

    it('should remove existing key', async () => {
      const result = await runCommand('remove', ['test-key'], 'test-password');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removed test-key');
      
      const getResult = await runCommand('get', ['test-key'], 'test-password');
      expect(getResult.stdout.trim()).toBe('');
    });
  });

  describe('change-password command', () => {
    it('should change vault password', async () => {
      await runCommand('init', [], 'test-password');
      await runCommand('set', ['test-key', 'test-value'], 'test-password');
      
      const result = await runCommand('change-password', [], 'test-password\nnew-password\n');
      
      if (result.exitCode !== 0) {
        console.log('STDOUT:', result.stdout);
        console.log('STDERR:', result.stderr);
      }
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Password changed successfully');
      
      const getResult = await runCommand('get', ['test-key'], 'new-password');
      expect(getResult.stdout.trim()).toBe('test-value');
    });
  });

  describe('error handling', () => {
    it('should handle missing vault file', async () => {
      const result = await runCommand('get', ['test-key'], 'test-password');
      
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Vault file does not exist');
    });

    it('should handle invalid commands', async () => {
      const result = await runCommand('invalid-command', []);
      
      expect(result.exitCode).not.toBe(0);
    });
  });
});