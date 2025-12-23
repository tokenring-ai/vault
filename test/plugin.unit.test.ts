import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TokenRingApp from '@tokenring-ai/app';
import plugin from '../plugin.js';

describe('Vault Plugin', () => {
  let mockApp: TokenRingApp;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockApp = {
      getConfigSlice: vi.fn(),
      addServices: vi.fn(),
    } as any;
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
    it('should install without config when no vault config provided', () => {
      mockApp.getConfigSlice = vi.fn().mockReturnValue(undefined);
      
      plugin.install(mockApp);
      
      expect(mockApp.getConfigSlice).toHaveBeenCalledWith('vault', expect.any(Object));
      expect(mockApp.addServices).not.toHaveBeenCalled();
    });

    it('should install with config when vault config provided', () => {
      const mockConfig = {
        vaultFile: '/path/to/vault',
        relockTime: 300000
      };
      
      mockApp.getConfigSlice = vi.fn().mockReturnValue(mockConfig);
      
      plugin.install(mockApp);
      
      expect(mockApp.getConfigSlice).toHaveBeenCalledWith('vault', expect.any(Object));
      expect(mockApp.addServices).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle configuration validation', () => {
      const mockConfig = {
        vaultFile: '/path/to/vault',
        relockTime: 300000
      };
      
      mockApp.getConfigSlice = vi.fn().mockReturnValue(mockConfig);
      
      plugin.install(mockApp);
      
      expect(mockApp.addServices).toHaveBeenCalled();
    });
  });
});