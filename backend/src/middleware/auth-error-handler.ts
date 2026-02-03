import type { App } from '../index.js';

/**
 * Authentication Error Handler Middleware
 * Provides detailed error logging and user-friendly error messages
 */

export interface AuthError {
  type:
    | 'VALIDATION_ERROR'
    | 'INVALID_CREDENTIALS'
    | 'EMAIL_EXISTS'
    | 'OAUTH_FAILED'
    | 'SERVER_ERROR'
    | 'UNAUTHORIZED';
  message: string;
  statusCode: number;
  debugInfo?: Record<string, unknown>;
}

/**
 * Handle authentication errors with detailed logging
 */
export function handleAuthError(
  app: App,
  error: AuthError,
  context: {
    method: string;
    identifier?: string;
    platform?: string;
    userId?: string;
  }
): AuthError {
  const logLevel =
    error.statusCode === 400 ? 'warn' : error.statusCode === 500 ? 'error' : 'warn';

  const logData = {
    errorType: error.type,
    errorMessage: error.message,
    statusCode: error.statusCode,
    authMethod: context.method,
    ...(context.identifier && { identifier: context.identifier }),
    ...(context.platform && { platform: context.platform }),
    ...(context.userId && { userId: context.userId }),
  };

  if (logLevel === 'error') {
    app.logger.error(logData, `Authentication error: ${error.type}`);
  } else {
    app.logger.warn(logData, `Authentication warning: ${error.type}`);
  }

  return error;
}

/**
 * Map OAuth errors to specific error messages
 */
export function mapOAuthError(
  errorMessage: string,
  platform: string
): {
  message: string;
  code: string;
  hint?: string;
} {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('invalid_client') || lowerError.includes('invalid oauth')) {
    return {
      message: 'Invalid OAuth client ID',
      code: 'INVALID_CLIENT_ID',
      hint: 'Check that GOOGLE_CLIENT_ID is correctly configured',
    };
  }

  if (lowerError.includes('sha-1') || lowerError.includes('fingerprint')) {
    return {
      message: 'SHA-1 fingerprint mismatch',
      code: 'FINGERPRINT_MISMATCH',
      hint: platform === 'android'
        ? 'Ensure your app signing configuration matches the registered SHA-1 fingerprint'
        : undefined,
    };
  }

  if (lowerError.includes('redirect') || lowerError.includes('redirect_uri')) {
    return {
      message: 'Redirect URI mismatch',
      code: 'REDIRECT_URI_MISMATCH',
      hint: 'Check that the callback URL is correctly registered with the OAuth provider',
    };
  }

  if (lowerError.includes('package')) {
    return {
      message: 'Package name mismatch',
      code: 'PACKAGE_MISMATCH',
      hint: 'Expected: com.alessiobisulca.acceptconnect.com',
    };
  }

  if (lowerError.includes('expired')) {
    return {
      message: 'OAuth token expired',
      code: 'TOKEN_EXPIRED',
      hint: 'Request a new authentication token',
    };
  }

  if (lowerError.includes('invalid_grant')) {
    return {
      message: 'Invalid authorization grant',
      code: 'INVALID_GRANT',
      hint: 'The authorization code may have already been used or expired',
    };
  }

  return {
    message: `${platform} authentication failed`,
    code: 'OAUTH_FAILED',
  };
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  error?: string;
} {
  if (password.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters',
    };
  }

  if (password.length > 128) {
    return {
      valid: false,
      error: 'Password must not exceed 128 characters',
    };
  }

  return { valid: true };
}

/**
 * Log authentication attempt with sanitized data
 */
export function logAuthAttempt(
  app: App,
  action: 'sign-up' | 'sign-in' | 'oauth' | 'verify',
  data: {
    method: string;
    identifier?: string;
    platform?: string;
    success: boolean;
    userId?: string;
    errorCode?: string;
  }
): void {
  const { method, identifier, platform, success, userId, errorCode } = data;

  if (success) {
    app.logger.info(
      {
        action,
        method,
        platform,
        userId,
      },
      `Authentication ${action} successful`
    );
  } else {
    app.logger.warn(
      {
        action,
        method,
        platform,
        identifier,
        errorCode,
      },
      `Authentication ${action} failed`
    );
  }
}
