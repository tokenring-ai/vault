import TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import plugin from '../plugin.js';

describe('Vault Plugin', () => {
  let mockApp: TokenRingApp;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockApp = createTestingApp()
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('plugin metadata', () => {
    it('should have correct plugin properties', () => {
      expect(plugin.name).toBe('@tokenring-ai/vault');
      expect(plugin.version).toBe('0.2.0');
      expect(plugin.description).toBe('A vault service for storing persisted credentials');
    });

    it('should be a valid TokenRingPlugin', () => {
      expect(typeof plugin.install).toBe('function');
    });
  });

  describe('install', () => {
    it('should not install without config when no vault config provided', () => {
      vi.spyOn(mockApp, 'addServices')

      plugin.install(mockApp, {});

      expect(mockApp.addServices).not.toHaveBeenCalled();
    });

    it('should install with config when vault config provided', () => {
      vi.spyOn(mockApp, 'addServices')
      plugin.install(mockApp, { vault: {
          vaultFile: '/path/to/vault',
          relockTime: 300000
        }
      });
      
      expect(mockApp.addServices).toHaveBeenCalled();
    });
  });
});
