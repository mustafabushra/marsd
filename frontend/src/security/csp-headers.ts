/**
 * Content Security Policy (CSP) Module
 * Implements and manages Content Security Policy headers and meta tags
 * Prevents XSS attacks and unauthorized resource loading
 *
 * OWASP Reference: A03:2021 – Injection
 */

/**\n * CSP directive types\n */\ninterface CspDirectives {\n  'default-src'?: string[];\n  'script-src'?: string[];\n  'style-src'?: string[];\n  'img-src'?: string[];\n  'font-src'?: string[];\n  'connect-src'?: string[];\n  'media-src'?: string[];\n  'object-src'?: string[];\n  'frame-src'?: string[];\n  'frame-ancestors'?: string[];\n  'base-uri'?: string[];\n  'form-action'?: string[];\n  'upgrade-insecure-requests'?: string[];\n  'block-all-mixed-content'?: string[];\n  'require-sri-for'?: string[];\n}

/**\n * CSP configuration\n */\ninterface CspConfig {\n  directives: CspDirectives;\n  reportOnly?: boolean;\n  reportUri?: string;\n}

/**\n * CSP Source options\n */\nconst CSP_SOURCES = {\n  SELF: \"'self'\",\n  UNSAFE_INLINE: \"'unsafe-inline'\",\n  UNSAFE_EVAL: \"'unsafe-eval'\",\n  NONE: \"'none'\",\n  NONCE: (nonce: string) => `'nonce-${nonce}'`,\n  HASH: (hash: string) => `'${hash}'`,\n  ANY: '*',\n  HTTPS: 'https:',\n  DATA: 'data:',\n};

/**\n * Default CSP configuration (strict)\n */\nconst DEFAULT_CSP_CONFIG: CspConfig = {\n  directives: {\n    'default-src': [CSP_SOURCES.SELF],\n    'script-src': [CSP_SOURCES.SELF],\n    'style-src': [CSP_SOURCES.SELF],\n    'img-src': [CSP_SOURCES.SELF, CSP_SOURCES.DATA, CSP_SOURCES.HTTPS],\n    'font-src': [CSP_SOURCES.SELF, CSP_SOURCES.DATA],\n    'connect-src': [CSP_SOURCES.SELF],\n    'frame-ancestors': [CSP_SOURCES.NONE],\n    'base-uri': [CSP_SOURCES.SELF],\n    'form-action': [CSP_SOURCES.SELF],\n    'upgrade-insecure-requests': [],\n  },\n  reportOnly: false,\n  reportUri: undefined,\n};

/**\n * Build CSP header value from directives\n */\nexport const buildCspHeader = (directives: CspDirectives): string => {\n  return Object.entries(directives)\n    .map(([key, values]) => {\n      if (!values || values.length === 0) {\n        return key; // For directives without values\n      }\n      return `${key} ${values.join(' ')}`;\n    })\n    .join('; ');\n};

/**\n * Create meta tag for CSP\n */\nexport const createCspMetaTag = (config: CspConfig): HTMLMetaElement => {\n  const meta = document.createElement('meta');\n  meta.httpEquiv = config.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';\n  meta.content = buildCspHeader(config.directives);\n  return meta;\n};

/**\n * Inject CSP meta tag into document head\n */\nexport const injectCspMetaTag = (config: CspConfig): void => {\n  if (typeof document === 'undefined') return;

  // Remove existing CSP meta tags\n  const existingMetas = document.querySelectorAll('meta[http-equiv=\"Content-Security-Policy\"]');\n  existingMetas.forEach((meta) => meta.remove());

  // Create and inject new CSP meta tag\n  const meta = createCspMetaTag(config);
  document.head.appendChild(meta);
};

/**\n * Generate random nonce for inline scripts/styles\n */\nexport const generateNonce = (): string => {\n  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');\n  }

  // Fallback for older browsers\n  return 'xxxxxxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
};

/**\n * Apply nonce to inline scripts\n */\nexport const applyNonceToScripts = (nonce: string): void => {\n  if (typeof document === 'undefined') return;

  const scripts = document.querySelectorAll('script:not([src])');\n  scripts.forEach((script) => {\n    script.setAttribute('nonce', nonce);
  });
};

/**\n * Apply nonce to inline styles\n */\nexport const applyNonceToStyles = (nonce: string): void => {\n  if (typeof document === 'undefined') return;

  const styles = document.querySelectorAll('style');\n  styles.forEach((style) => {\n    style.setAttribute('nonce', nonce);
  });

  const elements = document.querySelectorAll('[style]');\n  elements.forEach((element) => {\n    // Note: inline style attributes cannot use nonce\n    // Should be migrated to external stylesheets\n    console.warn('[CSP_WARNING]', 'Inline style attribute found, consider using external stylesheet');\n  });
};

/**\n * CSP Builder class for easy configuration\n */\nexport class CspBuilder {\n  private directives: CspDirectives = {};\n  private reportOnly = false;\n  private reportUri?: string;

  /**\n   * Set default source\n   */\n  setDefaultSrc(sources: string[]): this {\n    this.directives['default-src'] = sources;\n    return this;\n  }

  /**\n   * Set script source\n   */\n  setScriptSrc(sources: string[]): this {\n    this.directives['script-src'] = sources;\n    return this;\n  }

  /**\n   * Add script source\n   */\n  addScriptSrc(...sources: string[]): this {\n    this.directives['script-src'] = this.directives['script-src'] || [];\n    this.directives['script-src'].push(...sources);\n    return this;\n  }

  /**\n   * Set style source\n   */\n  setStyleSrc(sources: string[]): this {\n    this.directives['style-src'] = sources;\n    return this;\n  }

  /**\n   * Add style source\n   */\n  addStyleSrc(...sources: string[]): this {\n    this.directives['style-src'] = this.directives['style-src'] || [];\n    this.directives['style-src'].push(...sources);\n    return this;\n  }

  /**\n   * Set image source\n   */\n  setImgSrc(sources: string[]): this {\n    this.directives['img-src'] = sources;\n    return this;\n  }

  /**\n   * Set font source\n   */\n  setFontSrc(sources: string[]): this {\n    this.directives['font-src'] = sources;\n    return this;\n  }

  /**\n   * Set connect source\n   */\n  setConnectSrc(sources: string[]): this {\n    this.directives['connect-src'] = sources;\n    return this;\n  }

  /**\n   * Add connect source\n   */\n  addConnectSrc(...sources: string[]): this {\n    this.directives['connect-src'] = this.directives['connect-src'] || [];\n    this.directives['connect-src'].push(...sources);\n    return this;\n  }

  /**\n   * Set frame ancestors\n   */\n  setFrameAncestors(sources: string[]): this {\n    this.directives['frame-ancestors'] = sources;\n    return this;\n  }

  /**\n   * Set base URI\n   */\n  setBaseUri(sources: string[]): this {\n    this.directives['base-uri'] = sources;\n    return this;\n  }

  /**\n   * Set form action\n   */\n  setFormAction(sources: string[]): this {\n    this.directives['form-action'] = sources;\n    return this;\n  }

  /**\n   * Enable report-only mode\n   */\n  setReportOnly(reportOnly: boolean): this {\n    this.reportOnly = reportOnly;\n    return this;\n  }

  /**\n   * Set report URI\n   */\n  setReportUri(uri: string): this {\n    this.reportUri = uri;\n    this.directives['report-uri'] = [uri];\n    return this;\n  }

  /**\n   * Build configuration\n   */\n  build(): CspConfig {\n    return {\n      directives: this.directives,\n      reportOnly: this.reportOnly,\n      reportUri: this.reportUri,\n    };\n  }

  /**\n   * Get strict CSP (no inline scripts/styles)\n   */\n  static getStrict(): CspConfig {\n    return {\n      directives: {\n        'default-src': [CSP_SOURCES.SELF],\n        'script-src': [CSP_SOURCES.SELF],\n        'style-src': [CSP_SOURCES.SELF],\n        'img-src': [CSP_SOURCES.SELF, CSP_SOURCES.DATA, CSP_SOURCES.HTTPS],\n        'font-src': [CSP_SOURCES.SELF, CSP_SOURCES.HTTPS],\n        'connect-src': [CSP_SOURCES.SELF],\n        'frame-ancestors': [CSP_SOURCES.NONE],\n        'base-uri': [CSP_SOURCES.SELF],\n        'form-action': [CSP_SOURCES.SELF],\n        'upgrade-insecure-requests': [],\n        'block-all-mixed-content': [],\n      },\n      reportOnly: false,\n    };\n  }

  /**\n   * Get moderate CSP (allows some external resources)\n   */\n  static getModerate(apiUrl: string): CspConfig {\n    return {\n      directives: {\n        'default-src': [CSP_SOURCES.SELF],\n        'script-src': [CSP_SOURCES.SELF, 'https://cdn.example.com'],\n        'style-src': [CSP_SOURCES.SELF, CSP_SOURCES.UNSAFE_INLINE],\n        'img-src': [CSP_SOURCES.SELF, CSP_SOURCES.DATA, CSP_SOURCES.HTTPS],\n        'font-src': [CSP_SOURCES.SELF, CSP_SOURCES.HTTPS],\n        'connect-src': [CSP_SOURCES.SELF, apiUrl],\n        'frame-ancestors': [CSP_SOURCES.NONE],\n        'base-uri': [CSP_SOURCES.SELF],\n        'form-action': [CSP_SOURCES.SELF],\n      },\n      reportOnly: false,\n    };\n  }
}

/**\n * CSP violation listener\n */\nexport const listenToViolations = (callback: (report: SecurityPolicyViolationEvent) => void): (() => void) => {\n  if (typeof document === 'undefined') return () => {};

  const listener = (event: SecurityPolicyViolationEvent) => {\n    callback(event);
  };

  document.addEventListener('securitypolicyviolation', listener as EventListener);

  // Return unsubscribe function\n  return () => {\n    document.removeEventListener('securitypolicyviolation', listener as EventListener);
  };
};

/**\n * Log CSP violations\n */\nexport const enableCspViolationLogging = (): void => {\n  listenToViolations((event: SecurityPolicyViolationEvent) => {\n    console.warn('[CSP_VIOLATION]', {\n      blockedURI: event.blockedURI,\n      violatedDirective: event.violatedDirective,\n      originalPolicy: event.originalPolicy,\n      sourceFile: event.sourceFile,\n      lineNumber: event.lineNumber,\n      columnNumber: event.columnNumber,\n    });\n  });\n};

/**\n * Validate CSP header string\n */\nexport const validateCspHeader = (cspHeader: string): { isValid: boolean; errors: string[] } => {\n  const errors: string[] = [];

  if (typeof cspHeader !== 'string' || cspHeader.trim() === '') {
    errors.push('CSP header is empty or not a string');
    return { isValid: false, errors };\n  }

  const directives = cspHeader.split(';').map((d) => d.trim());

  directives.forEach((directive) => {\n    if (!directive) return;

    const [directiveName] = directive.split(' ');

    // Validate directive name\n    const validDirectives = [\n      'default-src',\n      'script-src',\n      'style-src',\n      'img-src',\n      'font-src',\n      'connect-src',\n      'media-src',\n      'object-src',\n      'frame-src',\n      'frame-ancestors',\n      'base-uri',\n      'form-action',\n      'upgrade-insecure-requests',\n      'block-all-mixed-content',\n    ];

    if (!validDirectives.includes(directiveName)) {\n      errors.push(`Unknown CSP directive: ${directiveName}`);\n    }
  });

  return {\n    isValid: errors.length === 0,\n    errors,\n  };\n};

export default {\n  CSP_SOURCES,\n  DEFAULT_CSP_CONFIG,\n  buildCspHeader,\n  createCspMetaTag,\n  injectCspMetaTag,\n  generateNonce,\n  applyNonceToScripts,\n  applyNonceToStyles,\n  CspBuilder,\n  listenToViolations,\n  enableCspViolationLogging,\n  validateCspHeader,
};
