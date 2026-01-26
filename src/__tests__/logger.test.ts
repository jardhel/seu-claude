import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, Logger } from '../utils/logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('default logger', () => {
    it('should be an instance of Logger', () => {
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('Logger class', () => {
    it('should create a logger with default prefix', () => {
      const log = new Logger();
      log.info('test message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[seu-claude]');
      expect(output).toContain('[INFO]');
      expect(output).toContain('test message');
    });

    it('should create a logger with custom prefix', () => {
      const log = new Logger('custom-prefix');
      log.info('test message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[custom-prefix]');
    });

    it('should create child loggers', () => {
      const parent = new Logger('parent');
      const child = parent.child('child');
      child.info('test');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[parent:child]');
    });

    it('should log debug messages when level is debug', () => {
      const log = new Logger('test', 'debug');
      log.debug('debug message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[DEBUG]');
    });

    it('should not log debug messages when level is info', () => {
      const log = new Logger('test', 'info');
      log.debug('debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      const log = new Logger('test', 'info');
      log.warn('warning message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
    });

    it('should log error messages', () => {
      const log = new Logger('test', 'info');
      log.error('error message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[ERROR]');
    });

    it('should include timestamp in output', () => {
      const log = new Logger('test');
      log.info('test');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      // ISO timestamp format: 2024-01-15T12:00:00.000Z
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });
});
