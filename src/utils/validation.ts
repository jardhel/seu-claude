/**
 * Input validation utilities for production hardening
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate file path to prevent path traversal attacks
 */
export function validateFilePath(filePath: string, allowedRoot?: string): ValidationResult {
  // Check for null bytes
  if (filePath.includes('\0')) {
    return { valid: false, error: 'Path contains null bytes' };
  }

  // Check for path traversal attempts
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  // Check for absolute paths outside allowed root
  if (allowedRoot) {
    const resolved = require('path').resolve(filePath);
    const resolvedRoot = require('path').resolve(allowedRoot);
    if (!resolved.startsWith(resolvedRoot)) {
      return { valid: false, error: 'Path outside allowed root' };
    }
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /^\/etc\//i,
    /^\/proc\//i,
    /^\/sys\//i,
    /^\/dev\//i,
    /^[a-z]:\\windows/i,
    /^[a-z]:\\system32/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(normalizedPath)) {
      return { valid: false, error: 'Access to system path denied' };
    }
  }

  return { valid: true };
}

/**
 * Validate search query to prevent injection attacks
 */
export function validateSearchQuery(query: string): ValidationResult {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query must be a non-empty string' };
  }

  // Max length check
  if (query.length > 10000) {
    return { valid: false, error: 'Query too long (max 10000 characters)' };
  }

  // Check for null bytes
  if (query.includes('\0')) {
    return { valid: false, error: 'Query contains null bytes' };
  }

  return { valid: true };
}

/**
 * Validate numeric parameters
 */
export function validateNumber(
  value: unknown,
  options: { min?: number; max?: number; name?: string } = {}
): ValidationResult {
  const { min, max, name = 'value' } = options;

  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: `${name} must be a valid number` };
  }

  if (min !== undefined && value < min) {
    return { valid: false, error: `${name} must be at least ${min}` };
  }

  if (max !== undefined && value > max) {
    return { valid: false, error: `${name} must be at most ${max}` };
  }

  return { valid: true };
}

/**
 * Sanitize user input for logging (remove sensitive data patterns)
 */
export function sanitizeForLogging(input: string): string {
  // Remove potential secrets/tokens
  let sanitized = input;
  
  // API keys patterns
  sanitized = sanitized.replace(/([a-zA-Z0-9_-]{20,})/g, '[REDACTED]');
  
  // Email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

  return sanitized;
}

/**
 * Rate limiter for tool calls
 */
export class RateLimiter {
  private calls: number[] = [];
  private readonly maxCalls: number;
  private readonly windowMs: number;

  constructor(maxCalls: number = 100, windowMs: number = 60000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  canProceed(): boolean {
    const now = Date.now();
    this.calls = this.calls.filter((time) => now - time < this.windowMs);
    
    if (this.calls.length >= this.maxCalls) {
      return false;
    }
    
    this.calls.push(now);
    return true;
  }

  getRemainingCalls(): number {
    const now = Date.now();
    this.calls = this.calls.filter((time) => now - time < this.windowMs);
    return Math.max(0, this.maxCalls - this.calls.length);
  }
}
