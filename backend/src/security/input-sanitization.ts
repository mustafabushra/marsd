/**
 * Input Sanitization Module
 * Validates and sanitizes all user inputs to prevent injection attacks
 * Follows OWASP input validation best practices
 *
 * OWASP Reference: A03:2021 – Injection, A07:2021 – Identification and Authentication Failures
 */

/**
 * Sanitization options
 */
interface SanitizationOptions {
  trim?: boolean;
  lowercase?: boolean;
  removeHtml?: boolean;
  removeSpecialChars?: boolean;
  maxLength?: number;
  allowedChars?: string;
}

/**
 * Validation result
 */
interface ValidationResult {
  isValid: boolean;
  error?: string;
  value?: any;
}

/**
 * Trim whitespace from both ends of string
 */
export const trim = (value: string): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

/**
 * Convert string to lowercase
 */
export const toLowerCase = (value: string): string => {
  if (typeof value !== 'string') return '';
  return value.toLowerCase();
};

/**
 * Remove HTML tags and entities
 * Prevents XSS attacks
 */
export const removeHtml = (value: string): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove scripts
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
};

/**
 * Remove special characters except those in allowlist
 */
export const removeSpecialChars = (value: string, allowedChars = ''): string => {
  if (typeof value !== 'string') return '';
  const pattern = new RegExp(`[^a-zA-Z0-9\\s${allowedChars}]`, 'g');
  return value.replace(pattern, '');
};

/**
 * Escape special characters for safe output
 * Prevents XSS in HTML context
 */
export const escapeHtml = (value: string): string => {
  if (typeof value !== 'string') return '';
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return value.replace(/[&<>"'/]/g, (char) => entityMap[char]);
};

/**
 * Sanitize string input with custom options
 */
export const sanitizeString = (
  value: any,
  options: SanitizationOptions = {}
): string => {
  const {
    trim: shouldTrim = true,
    lowercase: shouldLowercase = false,
    removeHtml: shouldRemoveHtml = true,
    removeSpecialChars: shouldRemoveSpecialChars = false,
    maxLength = Infinity,
    allowedChars = '',
  } = options;

  if (typeof value !== 'string') {
    return '';
  }

  let result = value;

  // Apply sanitization transformations
  if (shouldTrim) result = trim(result);
  if (shouldLowercase) result = toLowerCase(result);
  if (shouldRemoveHtml) result = removeHtml(result);
  if (shouldRemoveSpecialChars) result = removeSpecialChars(result, allowedChars);

  // Enforce max length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
};

/**
 * Sanitize email input
 * Validates email format and sanitizes
 */
export const sanitizeEmail = (value: any): string => {
  const sanitized = sanitizeString(value, { lowercase: true, trim: true });

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }

  // Additional sanitization for email
  return sanitized.replace(/[^a-zA-Z0-9@._-]/g, '');
};

/**
 * Sanitize numeric input
 */
export const sanitizeNumber = (value: any): number => {
  const num = parseFloat(value);
  if (isNaN(num)) {
    throw new Error('Invalid number format');
  }
  return num;
};

/**
 * Sanitize integer input
 */
export const sanitizeInteger = (value: any, min?: number, max?: number): number => {
  const num = parseInt(value, 10);

  if (isNaN(num)) {
    throw new Error('Invalid integer format');
  }

  if (min !== undefined && num < min) {
    throw new Error(`Value must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new Error(`Value must be at most ${max}`);
  }

  return num;
};

/**
 * Sanitize boolean input
 */
export const sanitizeBoolean = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return !!value;
};

/**
 * Sanitize URL input
 */
export const sanitizeUrl = (value: any): string => {
  try {
    const url = new URL(value);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    return url.toString();
  } catch {
    throw new Error('Invalid URL format');
  }
};

/**
 * Sanitize UUID input
 */
export const sanitizeUUID = (value: any): string => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(String(value))) {
    throw new Error('Invalid UUID format');
  }

  return String(value).toLowerCase();
};

/**
 * Sanitize phone number input
 */
export const sanitizePhoneNumber = (value: any): string => {
  const sanitized = sanitizeString(value);
  // Remove all non-digit characters except + at the start
  const phoneRegex = /^\+?[\d\s\-()]+$/;

  if (!phoneRegex.test(sanitized)) {
    throw new Error('Invalid phone number format');
  }

  // Keep only digits and + sign
  return sanitized.replace(/[^\d+]/g, '');
};

/**
 * Sanitize array input
 */
export const sanitizeArray = (
  value: any,
  options?: SanitizationOptions
): string[] => {
  if (!Array.isArray(value)) {
    throw new Error('Value must be an array');
  }

  return value.map((item) => {
    if (typeof item === 'string') {
      return sanitizeString(item, options);
    }
    return String(item);
  });
};

/**
 * Sanitize object input (recursive)
 */
export const sanitizeObject = (
  obj: Record<string, any>,
  options?: SanitizationOptions
): Record<string, any> => {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const sanitizedKey = sanitizeString(key);

    // Sanitize value based on type
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeString(value, options);
    } else if (typeof value === 'number') {
      sanitized[sanitizedKey] = value;
    } else if (typeof value === 'boolean') {
      sanitized[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = sanitizeArray(value, options);
    } else if (value !== null && typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeObject(value, options);
    } else {
      sanitized[sanitizedKey] = null;
    }
  }

  return sanitized;
};

/**
 * Validate and sanitize query parameters
 */
export const validateAndSanitizeQuery = (
  query: Record<string, any>,
  schema: Record<string, { type: string; required?: boolean; maxLength?: number }>
): ValidationResult => {
  try {
    const sanitized: Record<string, any> = {};

    for (const [key, rules] of Object.entries(schema)) {
      const value = query[key];

      if (rules.required && !value) {
        return {
          isValid: false,
          error: `Missing required field: ${key}`,
        };
      }

      if (!value) continue;

      switch (rules.type) {
        case 'string':
          sanitized[key] = sanitizeString(value, { maxLength: rules.maxLength });
          break;
        case 'email':
          sanitized[key] = sanitizeEmail(value);
          break;
        case 'number':
          sanitized[key] = sanitizeNumber(value);
          break;
        case 'integer':
          sanitized[key] = sanitizeInteger(value);
          break;
        case 'boolean':
          sanitized[key] = sanitizeBoolean(value);
          break;
        case 'url':
          sanitized[key] = sanitizeUrl(value);
          break;
        case 'uuid':
          sanitized[key] = sanitizeUUID(value);
          break;
        case 'phone':
          sanitized[key] = sanitizePhoneNumber(value);
          break;
        default:
          sanitized[key] = sanitizeString(value);
      }
    }

    return {
      isValid: true,
      value: sanitized,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Validation error',
    };
  }
};

/**
 * Validate and sanitize request body
 */
export const validateAndSanitizeBody = (
  body: Record<string, any>,
  schema: Record<string, { type: string; required?: boolean; maxLength?: number }>
): ValidationResult => {
  return validateAndSanitizeQuery(body, schema);
};

export default {
  trim,
  toLowerCase,
  removeHtml,
  removeSpecialChars,
  escapeHtml,
  sanitizeString,
  sanitizeEmail,
  sanitizeNumber,
  sanitizeInteger,
  sanitizeBoolean,
  sanitizeUrl,
  sanitizeUUID,
  sanitizePhoneNumber,
  sanitizeArray,
  sanitizeObject,
  validateAndSanitizeQuery,
  validateAndSanitizeBody,
};
