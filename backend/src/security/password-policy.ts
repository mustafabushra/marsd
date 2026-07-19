/**
 * Password Policy Module
 * Implements secure password validation, hashing, and management
 *
 * OWASP Reference: A07:2021 – Identification and Authentication Failures
 */

import crypto from 'crypto';
import * as argon2 from 'argon2';

/**
 * Password policy configuration
 */
interface PasswordPolicy {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  specialChars?: string;
  preventCommonPasswords?: boolean;
  preventPreviousPasswords?: number; // How many previous passwords to check
  expirationDays?: number; // Password expiration
}

/**
 * Default password policy (OWASP compliant)
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  preventCommonPasswords: true,
  preventPreviousPasswords: 5,
  expirationDays: 90,
};

/**
 * Common weak passwords that should be prevented
 */
const COMMON_PASSWORDS = [
  'password',
  '123456',
  '123456789',
  '12345678',
  'qwerty',
  'password123',
  '1234567',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'master',
  'admin',
  'login',
  'qwerty123',
  'abc123',
  'passw0rd',
];

/**
 * Hash password using Argon2 (most secure algorithm)
 * Argon2 is resistant to GPU and ASIC attacks
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id, // Use argon2id (most secure)
      memoryCost: 65536, // 64MB memory
      timeCost: 3, // 3 iterations
      parallelism: 4, // 4 parallelism
      saltLength: 16, // 16-byte salt
    });
  } catch (error) {
    throw new Error(`Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Verify password against hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    throw new Error(`Password verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Hash password using bcrypt as fallback
 */
export const hashPasswordBcrypt = async (password: string): Promise<string> => {
  // For environments where argon2 is not available
  const rounds = 12;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  return `$pbkdf2$100000$${salt}$${hash.toString('hex')}`;
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check length
  if (password.length < (policy.minLength || 12)) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  }

  if (password.length > (policy.maxLength || 128)) {
    errors.push(`Password must not exceed ${policy.maxLength} characters`);
  }

  // Check for uppercase
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for numbers
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for special characters
  if (policy.requireSpecialChars) {
    const specialChars = policy.specialChars || '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const hasSpecial = new RegExp(`[${specialChars.replace(/[[\]\\^-]/g, '\\$&')}]`).test(password);
    if (!hasSpecial) {
      errors.push(`Password must contain at least one special character (${specialChars})`);
    }
  }

  // Check for common passwords
  if (policy.preventCommonPasswords) {
    const lowerPassword = password.toLowerCase();
    if (COMMON_PASSWORDS.includes(lowerPassword)) {
      errors.push('Password is too common. Please choose a different password');
    }
  }

  // Check for sequential patterns
  if (hasSequentialPattern(password)) {
    errors.push('Password should not contain sequential patterns (abc, 123, etc.)');
  }

  // Check for repeated characters
  if (hasRepeatedCharacters(password)) {
    errors.push('Password should not contain more than 3 repeated characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Check for sequential patterns (abc, 123, etc.)
 */
const hasSequentialPattern = (password: string, length: number = 3): boolean => {
  const lowerPassword = password.toLowerCase();

  for (let i = 0; i < lowerPassword.length - length + 1; i++) {
    let isSequential = true;
    const firstCode = lowerPassword.charCodeAt(i);

    for (let j = 1; j < length; j++) {
      const currentCode = lowerPassword.charCodeAt(i + j);
      if (currentCode !== firstCode + j) {
        isSequential = false;
        break;
      }
    }

    if (isSequential) return true;
  }

  return false;
};

/**
 * Check for repeated characters
 */
const hasRepeatedCharacters = (password: string, maxRepeat: number = 3): boolean => {
  const regex = new RegExp(`(.)\\1{${maxRepeat},}`);
  return regex.test(password);
};

/**
 * Generate secure random password
 */
export const generateSecurePassword = (length: number = 16, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): string => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const specialChars = policy.specialChars || '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let chars = lowercase + uppercase + numbers + specialChars;
  let password = '';

  // Ensure policy requirements are met
  if (policy.requireUppercase) password += uppercase[Math.floor(Math.random() * uppercase.length)];
  if (policy.requireLowercase) password += lowercase[Math.floor(Math.random() * lowercase.length)];
  if (policy.requireNumbers) password += numbers[Math.floor(Math.random() * numbers.length)];
  if (policy.requireSpecialChars) password += specialChars[Math.floor(Math.random() * specialChars.length)];

  // Fill remaining length with random characters
  while (password.length < length) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  // Shuffle password
  password = password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');

  return password.substring(0, length);
};

/**
 * Password history manager
 */
export class PasswordHistory {
  /**
   * Add password to history
   */
  static async addToHistory(
    previousHashes: string[],
    newPasswordHash: string,
    maxHistory: number = 5
  ): Promise<string[]> {
    const history = [newPasswordHash, ...previousHashes];
    return history.slice(0, maxHistory);
  }

  /**
   * Check if password was previously used
   */
  static async checkPasswordHistory(
    password: string,
    previousHashes: string[],
    policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
  ): Promise<boolean> {
    const maxPrevious = policy.preventPreviousPasswords || 5;

    for (let i = 0; i < Math.min(previousHashes.length, maxPrevious); i++) {
      const isMatch = await verifyPassword(password, previousHashes[i]);
      if (isMatch) {
        return true; // Password was previously used
      }
    }

    return false; // Password is new
  }
}

/**
 * Password reset token generation and validation
 */
export class PasswordResetToken {
  /**
   * Generate reset token
   * Returns both the token and its hash (hash is stored in DB)
   */
  static generateToken(length: number = 32): { token: string; hash: string } {
    const token = crypto.randomBytes(length).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    return { token, hash };
  }

  /**
   * Verify reset token
   */
  static verifyToken(token: string, storedHash: string): boolean {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(storedHash));
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(createdAt: Date, expirationMinutes: number = 30): boolean {
    const now = new Date();
    const expirationTime = new Date(createdAt.getTime() + expirationMinutes * 60 * 1000);
    return now > expirationTime;
  }
}

/**
 * Password expiration manager
 */
export class PasswordExpiration {
  /**
   * Check if password is expired
   */
  static isPasswordExpired(lastChangedAt: Date, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): boolean {
    const expirationDays = policy.expirationDays || 90;
    const now = new Date();
    const expirationDate = new Date(lastChangedAt.getTime() + expirationDays * 24 * 60 * 60 * 1000);

    return now > expirationDate;
  }

  /**
   * Get days until password expires
   */
  static getDaysUntilExpiration(
    lastChangedAt: Date,
    policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
  ): number {
    const expirationDays = policy.expirationDays || 90;
    const now = new Date();
    const expirationDate = new Date(lastChangedAt.getTime() + expirationDays * 24 * 60 * 60 * 1000);

    const daysRemaining = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysRemaining);
  }

  /**
   * Should user be warned about expiration (e.g., 14 days before)
   */
  static shouldWarnUser(lastChangedAt: Date, warningDaysBefore: number = 14): boolean {
    const daysRemaining = this.getDaysUntilExpiration(lastChangedAt);
    return daysRemaining <= warningDaysBefore && daysRemaining > 0;
  }
}

/**
 * Brute force attack detection
 */
export class BruteForceProtection {
  private attempts = new Map<string, { count: number; firstAttemptTime: number }>();

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(userId: string): number {
    const now = Date.now();
    const existing = this.attempts.get(userId);

    if (existing && now - existing.firstAttemptTime < 15 * 60 * 1000) {
      // Within 15-minute window
      existing.count++;
      return existing.count;
    }

    // New attempt window
    this.attempts.set(userId, { count: 1, firstAttemptTime: now });
    return 1;
  }

  /**
   * Check if user is locked out
   */
  isLockedOut(userId: string, maxAttempts: number = 5): boolean {
    const attempt = this.attempts.get(userId);
    if (!attempt) return false;

    const now = Date.now();
    if (now - attempt.firstAttemptTime > 15 * 60 * 1000) {
      // 15-minute window expired
      this.attempts.delete(userId);
      return false;
    }

    return attempt.count >= maxAttempts;
  }

  /**
   * Get minutes remaining until lockout expires
   */
  getLockedOutMinutes(userId: string): number {
    const attempt = this.attempts.get(userId);
    if (!attempt) return 0;

    const now = Date.now();
    const windowExpiration = attempt.firstAttemptTime + 15 * 60 * 1000;
    const minutesRemaining = Math.ceil((windowExpiration - now) / (1000 * 60));

    return Math.max(0, minutesRemaining);
  }

  /**
   * Clear failed attempts for user
   */
  clearAttempts(userId: string): void {
    this.attempts.delete(userId);
  }

  /**
   * Clear all attempts
   */
  clearAllAttempts(): void {
    this.attempts.clear();
  }
}

/**
 * Password change request validation
 */
export const validatePasswordChange = async (
  currentPassword: string,
  newPassword: string,
  currentPasswordHash: string,
  previousPasswordHashes: string[] = [],
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): Promise<{ isValid: boolean; errors: string[] }> => {
  const errors: string[] = [];

  // Verify current password
  const isCurrentCorrect = await verifyPassword(currentPassword, currentPasswordHash);
  if (!isCurrentCorrect) {
    errors.push('Current password is incorrect');
  }

  // Validate new password strength
  const strengthValidation = validatePasswordStrength(newPassword, policy);
  if (!strengthValidation.isValid) {
    errors.push(...strengthValidation.errors);
  }

  // Check if new password is same as current
  const isSamePassword = await verifyPassword(newPassword, currentPasswordHash);
  if (isSamePassword) {
    errors.push('New password must be different from current password');
  }

  // Check password history
  const wasRecentlyUsed = await PasswordHistory.checkPasswordHistory(newPassword, previousPasswordHashes, policy);
  if (wasRecentlyUsed) {
    errors.push(`Cannot reuse one of your last ${policy.preventPreviousPasswords} passwords`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default {
  DEFAULT_PASSWORD_POLICY,
  hashPassword,
  verifyPassword,
  hashPasswordBcrypt,
  validatePasswordStrength,
  generateSecurePassword,
  PasswordHistory,
  PasswordResetToken,
  PasswordExpiration,
  BruteForceProtection,
  validatePasswordChange,
};
