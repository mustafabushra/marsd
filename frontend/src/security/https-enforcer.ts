/**
 * HTTPS Enforcement Module
 * Ensures all connections use HTTPS in production
 * Implements security checks and redirects
 *
 * OWASP Reference: A02:2021 – Cryptographic Failures
 */

/**
 * HTTPS enforcement configuration
 */
interface HttpsEnforcerConfig {
  enabled?: boolean;
  redirectToHttps?: boolean;
  allowLocalhost?: boolean;
  allowedInsecureHosts?: string[];
  hstsMaxAge?: number;
  hstsIncludeSubDomains?: boolean;
  hstsPreload?: boolean;
  upgradeInsecureRequests?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HttpsEnforcerConfig = {\n  enabled: process.env.NODE_ENV === 'production',
  redirectToHttps: true,
  allowLocalhost: true,
  allowedInsecureHosts: [],
  hstsMaxAge: 31536000, // 1 year
  hstsIncludeSubDomains: true,
  hstsPreload: true,
  upgradeInsecureRequests: true,
};

/**
 * Check if current connection is HTTPS
 */\nexport const isHttps = (): boolean => {\n  if (typeof window === 'undefined') return true; // Server-side, assume safe\n  return window.location.protocol === 'https:';
};

/**\n * Check if connection is from localhost\n */\nexport const isLocalhost = (): boolean => {\n  if (typeof window === 'undefined') return false;
  return (\n    window.location.hostname === 'localhost' ||\n    window.location.hostname === '127.0.0.1' ||\n    window.location.hostname === '[::1]' ||\n    window.location.hostname.endsWith('.local')\n  );
};

/**\n * Check if host is allowed to use HTTP\n */\nexport const isHostAllowedInsecure = (config: HttpsEnforcerConfig = DEFAULT_CONFIG): boolean => {\n  if (typeof window === 'undefined') return false;

  if (config.allowLocalhost && isLocalhost()) {
    return true;
  }

  if (config.allowedInsecureHosts) {
    return config.allowedInsecureHosts.some(\n      (host) => window.location.hostname.includes(host)\n    );
  }

  return false;
};

/**\n * Enforce HTTPS and redirect if necessary\n */\nexport const enforceHttps = (config: HttpsEnforcerConfig = DEFAULT_CONFIG): void => {\n  if (typeof window === 'undefined') return; // Server-side\n\n  if (!config.enabled) return;

  // Already using HTTPS\n  if (isHttps()) return;

  // Check if this host is allowed to use HTTP\n  if (isHostAllowedInsecure(config)) return;

  // Redirect to HTTPS\n  if (config.redirectToHttps) {
    const secureUrl = window.location.href.replace('http://', 'https://');
    window.location.href = secureUrl;
  }
};

/**\n * Set HSTS header (Client-side simulation)\n * In production, this should be set by the server\n */\nexport const setHstsHeader = (config: HttpsEnforcerConfig = DEFAULT_CONFIG): string => {\n  if (!config.hstsMaxAge) return '';

  let header = `max-age=${config.hstsMaxAge}`;

  if (config.hstsIncludeSubDomains) {
    header += '; includeSubDomains';
  }

  if (config.hstsPreload) {
    header += '; preload';
  }

  return header;
};

/**\n * Get Content Security Policy upgrade directive\n */\nexport const getUpgradeInsecureRequestsCSP = (): string => {\n  return 'upgrade-insecure-requests';
};

/**\n * Validate certificate pinning (for sensitive operations)\n * Note: This is more commonly done at the app level (e.g., React Native)\n */\nexport const validateCertificatePinning = (\n  expectedCertificateHash: string\n): boolean => {\n  // This would require server cooperation and specialized libraries\n  // For web, rely on browser's built-in validation\n  // Implement for native apps with certificate pinning libraries\n  console.warn('[CERTIFICATE_PINNING]', 'Not implemented for web environment');\n  return true; // Assume valid in web context\n};

/**\n * Check for mixed content (HTTP resources on HTTPS page)\n */\nexport const checkForMixedContent = (): { hasMixedContent: boolean; resources: string[] } => {\n  if (typeof window === 'undefined' || typeof document === 'undefined') {\n    return { hasMixedContent: false, resources: [] };
  }

  const mixedContentResources: string[] = [];

  if (isHttps()) {
    // Check for HTTP script tags\n    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach((script) => {\n      const src = script.getAttribute('src') || '';
      if (src.startsWith('http://')) {
        mixedContentResources.push(src);
      }
    });

    // Check for HTTP stylesheets\n    const links = document.querySelectorAll('link[rel=\"stylesheet\"][href]');
    links.forEach((link) => {\n      const href = link.getAttribute('href') || '';
      if (href.startsWith('http://')) {
        mixedContentResources.push(href);
      }
    });

    // Check for HTTP images\n    const images = document.querySelectorAll('img[src]');
    images.forEach((img) => {\n      const src = img.getAttribute('src') || '';
      if (src.startsWith('http://')) {
        mixedContentResources.push(src);
      }
    });

    // Check for HTTP iframes\n    const iframes = document.querySelectorAll('iframe[src]');
    iframes.forEach((iframe) => {\n      const src = iframe.getAttribute('src') || '';
      if (src.startsWith('http://')) {
        mixedContentResources.push(src);
      }
    });
  }

  return {
    hasMixedContent: mixedContentResources.length > 0,
    resources: mixedContentResources,
  };
};

/**\n * Monitor for mixed content issues\n */\nexport const monitorMixedContent = (): void => {\n  if (typeof window === 'undefined') return;

  // Check initially\n  const initial = checkForMixedContent();
  if (initial.hasMixedContent) {
    console.warn('[MIXED_CONTENT_WARNING]', 'Mixed content detected:', initial.resources);
  }

  // Monitor for future mixed content (using MutationObserver)\n  if (!isHttps()) return; // Only relevant for HTTPS

  const observer = new MutationObserver(() => {\n    const current = checkForMixedContent();
    if (current.hasMixedContent) {
      console.warn('[MIXED_CONTENT_ADDED]', current.resources);
    }
  });

  observer.observe(document.body, {\n    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'href'],
  });
};

/**\n * Upgrade insecure requests in URLs\n */\nexport const upgradeUrl = (url: string): string => {\n  if (typeof url !== 'string') return url;
  return url.replace(/^http:/, 'https:');
};

/**\n * Validate URL protocol\n */\nexport const isUrlSecure = (url: string): boolean => {\n  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:' || urlObj.protocol === 'wss:';
  } catch {\n    // Relative URLs are considered secure\n    return !url.startsWith('http://');\n  }
};

/**\n * Get secure API endpoint\n */\nexport const getSecureApiEndpoint = (endpoint: string): string => {\n  if (typeof endpoint !== 'string') return '';

  // If endpoint is already secure or relative, return as-is\n  if (isUrlSecure(endpoint) || !endpoint.startsWith('http')) {
    return endpoint;
  }

  // Upgrade insecure endpoint to HTTPS\n  return upgradeUrl(endpoint);
};

/**\n * HTTPS Enforcer class\n */\nexport class HttpsEnforcer {\n  private config: HttpsEnforcerConfig;

  constructor(config: Partial<HttpsEnforcerConfig> = {}) {\n    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**\n   * Initialize HTTPS enforcement\n   */\n  initialize(): void {\n    // Enforce HTTPS\n    enforceHttps(this.config);

    // Monitor for mixed content\n    monitorMixedContent();

    // Add Content Security Policy upgrade directive\n    if (this.config.upgradeInsecureRequests) {\n      this.addUpgradeInsecureRequestsCSP();
    }

    console.log('[HTTPS_ENFORCER]', 'Initialized with config:', this.config);
  }

  /**\n   * Add Content Security Policy upgrade directive to document\n   */\n  private addUpgradeInsecureRequestsCSP(): void {\n    if (typeof document === 'undefined') return;

    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = getUpgradeInsecureRequestsCSP();

    document.head.appendChild(meta);
  }

  /**\n   * Check if HTTPS is being used\n   */\n  isSecure(): boolean {\n    return isHttps();
  }

  /**\n   * Check for mixed content\n   */\n  hasMixedContent(): boolean {\n    const result = checkForMixedContent();
    return result.hasMixedContent;
  }

  /**\n   * Get mixed content resources\n   */\n  getMixedContentResources(): string[] {\n    const result = checkForMixedContent();
    return result.resources;
  }

  /**\n   * Get HSTS header value\n   */\n  getHstsHeaderValue(): string {\n    return setHstsHeader(this.config);
  }
}

export default {\n  enforceHttps,
  isHttps,
  isLocalhost,
  isHostAllowedInsecure,
  setHstsHeader,
  getUpgradeInsecureRequestsCSP,
  checkForMixedContent,
  monitorMixedContent,
  upgradeUrl,
  isUrlSecure,
  getSecureApiEndpoint,
  HttpsEnforcer,
};
