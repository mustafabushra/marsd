/**
 * XSS (Cross-Site Scripting) Prevention Module
 * Sanitizes and encodes output to prevent malicious script execution
 *
 * OWASP Reference: A03:2021 – Injection, A07:2021 – Cross-Site Scripting (XSS)
 */

/**
 * HTML entity map for escaping
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Dangerous HTML tags that should never be allowed
 */
const DANGEROUS_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form',
  'input', 'button', 'style', 'link', 'meta',
];

/**
 * Dangerous attributes that can execute scripts
 */
const DANGEROUS_ATTRIBUTES = [
  'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout',
  'onchange', 'onsubmit', 'onfocus', 'onblur', 'onkeyup',
  'onkeydown', 'onmousedown', 'onmouseup', 'ondblclick',
  'oncontextmenu', 'ondrag', 'ondrop', 'onwheel',
];

/**
 * Escape HTML special characters
 * Converts dangerous characters to HTML entities
 */
export const escapeHtml = (text: string): string => {
  if (typeof text !== 'string') return '';

  return text.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] || char);
};

/**
 * Escape JavaScript string literal
 * Prevents breaking out of strings in JS context
 */
export const escapeJavaScript = (text: string): string => {
  if (typeof text !== 'string') return '';

  return text
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/"/g, '\\"') // Double quote
    .replace(/'/g, "\\'") // Single quote
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r') // Carriage return
    .replace(/\t/g, '\\t') // Tab
    .replace(/\//g, '\\/') // Forward slash (important in HTML context)
    .replace(/</g, '\\x3C') // Less than
    .replace(/>/g, '\\x3E'); // Greater than
};

/**
 * Escape CSS string literal
 * Prevents CSS injection attacks
 */
export const escapeCss = (text: string): string => {
  if (typeof text !== 'string') return '';

  return text
    .split('')
    .map(char => {
      const code = char.charCodeAt(0);
      // Escape non-ASCII and special characters
      if (code < 32 || code > 126 || char === '"' || char === "'") {
        return '\\' + code.toString(16).padStart(2, '0') + ' ';
      }
      return char;
    })
    .join('');
};

/**
 * Escape URL parameter
 * Prevents URL-based XSS attacks
 */
export const escapeUrlParameter = (text: string): string => {
  if (typeof text !== 'string') return '';

  return encodeURIComponent(text);
};

/**
 * Remove potentially dangerous HTML tags
 */
export const stripDangerousTags = (html: string): string => {
  if (typeof html !== 'string') return '';

  let result = html;

  // Remove script tags and content
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove iframe tags
  result = result.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove event handlers
  DANGEROUS_ATTRIBUTES.forEach(attr => {
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*['\"][^'\"]*['\"]`, 'gi'), '');
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]+`, 'gi'), '');
  });

  // Remove style tags and inline styles
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  result = result.replace(/\s+style\s*=\s*['\"][^'\"]*['\"]/gi, '');

  return result;
};

/**
 * Sanitize HTML allowing only safe tags
 */
export const sanitizeHtml = (html: string, allowedTags: string[] = []): string => {
  if (typeof html !== 'string') return '';

  // Default safe tags if none specified
  const safe = allowedTags.length > 0
    ? allowedTags
    : ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li'];

  let result = html;

  // Remove dangerous tags completely
  DANGEROUS_TAGS.forEach(tag => {
    result = result.replace(new RegExp(`<${tag}\\b[^>]*>.*?<\/${tag}>`, 'gi'), '');
    result = result.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  });

  // Remove all event handlers
  DANGEROUS_ATTRIBUTES.forEach(attr => {
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*['\"][^'\"]*['\"]`, 'gi'), '');
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]+`, 'gi'), '');
  });

  // Remove style attributes and style tags
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  result = result.replace(/\s+style\s*=\s*['\"][^'\"]*['\"]/gi, '');

  // For 'a' tag, sanitize href to prevent javascript: URLs
  if (safe.includes('a')) {
    result = result.replace(/href\s*=\s*['\"]javascript:[^'\"]*['\"]/gi, '');
    result = result.replace(/href\s*=\s*javascript:[^\s>]*/gi, '');
  }

  return result;
};

/**
 * Validate URL to prevent javascript: and data: protocols
 */
export const isUrlSafe = (url: string): boolean => {
  if (typeof url !== 'string') return false;

  try {
    // Check for dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];

    const lowerUrl = url.toLowerCase().trim();
    if (dangerousProtocols.some(proto => lowerUrl.startsWith(proto))) {
      return false;
    }

    // Try to parse as URL
    new URL(url);
    return true;
  } catch {
    // Not a valid URL, might be a relative path which is OK
    if (url.startsWith('/') || url.startsWith('../') || url.startsWith('./')) {
      return true;
    }
    return false;
  }
};

/**
 * Sanitize URL to prevent XSS
 */
export const sanitizeUrl = (url: string): string => {
  if (!isUrlSafe(url)) {
    return ''; // Return empty string for unsafe URLs
  }

  return url;
};

/**
 * Create safe content for JSON response
 * Prevents XSS when JSON is embedded in HTML
 */
export const createSafeJsonResponse = (data: any): string => {
  const json = JSON.stringify(data);

  // Escape special characters that could break out of JSON context
  return json
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026');
};

/**
 * Validate and sanitize user-generated HTML content
 */
export const validateUserHtml = (
  html: string,
  maxLength: number = 10000
): { isValid: boolean; sanitized: string; errors: string[] } => {
  const errors: string[] = [];

  if (typeof html !== 'string') {
    errors.push('HTML content must be a string');
    return { isValid: false, sanitized: '', errors };
  }

  if (html.length > maxLength) {
    errors.push(`HTML content exceeds maximum length of ${maxLength} characters`);
  }

  // Check for script tags
  if (/<script/i.test(html)) {
    errors.push('Script tags are not allowed');
  }

  // Check for iframe tags
  if (/<iframe/i.test(html)) {
    errors.push('Iframe tags are not allowed');
  }

  // Check for event handlers
  if (/on\w+\s*=/i.test(html)) {
    errors.push('Event handlers are not allowed');
  }

  const sanitized = sanitizeHtml(html);

  return {
    isValid: errors.length === 0,
    sanitized,
    errors,
  };
};

/**
 * Content Security Policy (CSP) header builder
 */
export class CspHeaderBuilder {
  private directives: Record<string, string[]> = {};

  /**
   * Set default source
   */
  setDefaultSrc(sources: string[]): this {
    this.directives['default-src'] = sources;
    return this;
  }

  /**
   * Set script source
   */
  setScriptSrc(sources: string[]): this {
    this.directives['script-src'] = sources;
    return this;
  }

  /**
   * Set style source
   */
  setStyleSrc(sources: string[]): this {
    this.directives['style-src'] = sources;
    return this;
  }

  /**
   * Set image source
   */
  setImgSrc(sources: string[]): this {
    this.directives['img-src'] = sources;
    return this;
  }

  /**
   * Set font source
   */
  setFontSrc(sources: string[]): this {
    this.directives['font-src'] = sources;
    return this;
  }

  /**
   * Set connect source (AJAX, WebSocket, etc.)
   */
  setConnectSrc(sources: string[]): this {
    this.directives['connect-src'] = sources;
    return this;
  }

  /**
   * Build CSP header value
   */
  build(): string {
    return Object.entries(this.directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
  }

  /**
   * Get restrictive CSP (strict, no inline scripts)
   */
  static getStrict(): string {
    return new CspHeaderBuilder()
      .setDefaultSrc(["'self'"])
      .setScriptSrc(["'self'"])
      .setStyleSrc(["'self'"])
      .setImgSrc(["'self'", 'data:', 'https:'])
      .setFontSrc(["'self'"])
      .setConnectSrc(["'self'"])
      .build();
  }

  /**
   * Get moderate CSP (allows some external resources)
   */
  static getModerate(apiUrl: string): string {
    return new CspHeaderBuilder()
      .setDefaultSrc(["'self'"])
      .setScriptSrc(["'self'", 'https://trusted-cdn.example.com'])
      .setStyleSrc(["'self'", "'unsafe-inline'"])
      .setImgSrc(["'self'", 'data:', 'https:'])
      .setFontSrc(["'self'", 'https:'])
      .setConnectSrc(["'self'", apiUrl])
      .build();
  }
}

/**
 * Detect potential XSS attempts in input
 */
export const detectXssAttempt = (input: string): { isXss: boolean; details: string[] } => {
  const details: string[] = [];

  if (typeof input !== 'string') {
    return { isXss: false, details };
  }

  // Check for script tags
  if (/<script/i.test(input)) {
    details.push('Contains script tag');
  }

  // Check for event handlers
  if (/on\w+\s*=/i.test(input)) {
    details.push('Contains event handler');
  }

  // Check for iframe
  if (/<iframe/i.test(input)) {
    details.push('Contains iframe tag');
  }

  // Check for javascript: URL
  if (/javascript:/i.test(input)) {
    details.push('Contains javascript: URL');
  }

  // Check for data: URL
  if (/data:text\/html/i.test(input)) {
    details.push('Contains data: HTML URL');
  }

  // Check for SVG with script
  if (/<svg/i.test(input) && /<script/i.test(input)) {
    details.push('Contains SVG with script');
  }

  return {
    isXss: details.length > 0,
    details,
  };
};

export default {
  escapeHtml,
  escapeJavaScript,
  escapeCss,
  escapeUrlParameter,
  stripDangerousTags,
  sanitizeHtml,
  isUrlSafe,
  sanitizeUrl,
  createSafeJsonResponse,
  validateUserHtml,
  CspHeaderBuilder,
  detectXssAttempt,
};
