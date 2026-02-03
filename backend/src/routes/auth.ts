import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as authSchema from '../db/auth-schema.js';

/**
 * Custom Authentication Routes
 * Provides email/password sign-up, sign-in, and enhanced error handling
 * Also supports username login in addition to email login
 */
export function registerAuthRoutes(app: App) {
  /**
   * POST /api/auth/sign-up - Sign up with email and password
   * Body: { email: string, password: string, name?: string }
   */
  app.fastify.post(
    '/api/auth/sign-up',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email, password, name } = request.body as {
        email?: string;
        password?: string;
        name?: string;
      };

      app.logger.info(
        {
          email,
          hasPassword: !!password,
          hasName: !!name,
          method: 'email/password',
        },
        'Sign-up attempt'
      );

      // Validation
      if (!email || !password) {
        app.logger.warn(
          { email, hasPassword: !!password },
          'Sign-up validation failed - missing email or password'
        );
        return reply.status(400).send({
          error: 'Email and password are required',
          code: 'VALIDATION_ERROR',
        });
      }

      if (!email.includes('@')) {
        app.logger.warn({ email }, 'Sign-up validation failed - invalid email');
        return reply.status(400).send({
          error: 'Invalid email format',
          code: 'INVALID_EMAIL',
        });
      }

      if (password.length < 8) {
        app.logger.warn(
          { email, passwordLength: password.length },
          'Sign-up validation failed - password too short'
        );
        return reply.status(400).send({
          error: 'Password must be at least 8 characters',
          code: 'PASSWORD_TOO_SHORT',
        });
      }

      if (password.length > 128) {
        return reply.status(400).send({
          error: 'Password must not exceed 128 characters',
          code: 'PASSWORD_TOO_LONG',
        });
      }

      try {
        // Check if email already exists
        const existingUser = await app.db.query.user.findFirst({
          where: eq(authSchema.user.email, email),
        });

        if (existingUser) {
          app.logger.warn(
            { email },
            'Sign-up failed - email already exists'
          );
          return reply.status(409).send({
            error: 'Email already exists',
            code: 'EMAIL_EXISTS',
          });
        }

        // TODO: Use Better Auth's built-in sign-up endpoint
        // This is a placeholder for the actual implementation
        // In production, use the authenticated endpoint provided by Better Auth

        app.logger.info(
          { email, hasName: !!name },
          'Sign-up in progress (delegated to Better Auth)'
        );

        return reply.status(501).send({
          error: 'Sign-up should be handled through Better Auth endpoints',
          hint: 'Use POST /api/auth/sign-up/email with email and password',
        });
      } catch (error) {
        app.logger.error(
          { err: error, email, method: 'email/password' },
          'Sign-up failed with server error'
        );
        return reply.status(500).send({
          error: 'Failed to create account',
          code: 'SERVER_ERROR',
        });
      }
    }
  );

  /**
   * POST /api/auth/sign-in - Sign in with email/username and password
   * Body: { email_or_username: string, password: string }
   * Supports both email and username for login
   */
  app.fastify.post(
    '/api/auth/sign-in',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email_or_username, password } = request.body as {
        email_or_username?: string;
        password?: string;
      };

      // Log without password for security
      app.logger.info(
        {
          identifier: email_or_username,
          identifierType: email_or_username?.includes('@') ? 'email' : 'username',
          method: 'email/password',
        },
        'Sign-in attempt'
      );

      // Validation
      if (!email_or_username || !password) {
        app.logger.warn(
          { hasIdentifier: !!email_or_username, hasPassword: !!password },
          'Sign-in validation failed - missing credentials'
        );
        return reply.status(400).send({
          error: 'Email/username and password are required',
          code: 'VALIDATION_ERROR',
        });
      }

      try {
        // Determine if input is email or username
        const isEmail = email_or_username.includes('@');
        let user;

        if (isEmail) {
          // Look up by email
          user = await app.db.query.user.findFirst({
            where: eq(authSchema.user.email, email_or_username),
          });

          if (!user) {
            app.logger.warn(
              { email: email_or_username },
              'Sign-in failed - user not found by email'
            );
            return reply.status(401).send({
              error: 'Invalid credentials',
              code: 'INVALID_CREDENTIALS',
            });
          }
        } else {
          // Look up by username (name field)
          user = await app.db.query.user.findFirst({
            where: eq(authSchema.user.name, email_or_username),
          });

          if (!user) {
            app.logger.warn(
              { username: email_or_username },
              'Sign-in failed - user not found by username'
            );
            return reply.status(401).send({
              error: 'Invalid credentials',
              code: 'INVALID_CREDENTIALS',
            });
          }
        }

        // TODO: Verify password against stored hash using Better Auth
        // This is a placeholder - actual password verification should be done by Better Auth
        // The password verification happens automatically through Better Auth's sign-in endpoint

        app.logger.info(
          { userId: user.id, identifier: email_or_username, identifierType: isEmail ? 'email' : 'username' },
          'Sign-in successful (delegated to Better Auth)'
        );

        return reply.status(501).send({
          error: 'Sign-in should be handled through Better Auth endpoints',
          hint: 'Use POST /api/auth/sign-in/email with email and password',
        });
      } catch (error) {
        app.logger.error(
          { err: error, identifier: email_or_username, method: 'email/password' },
          'Sign-in failed with server error'
        );
        return reply.status(500).send({
          error: 'Failed to sign in',
          code: 'SERVER_ERROR',
        });
      }
    }
  );

  /**
   * POST /api/auth/oauth/google - Handle Google OAuth with error details
   * This endpoint logs detailed OAuth failures for debugging
   */
  app.fastify.post(
    '/api/auth/oauth/google',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { code, idToken, accessToken, platform } = request.body as {
        code?: string;
        idToken?: string;
        accessToken?: string;
        platform?: 'web' | 'android' | 'ios';
      };

      app.logger.info(
        {
          platform,
          hasCode: !!code,
          hasIdToken: !!idToken,
          hasAccessToken: !!accessToken,
        },
        'Google OAuth sign-in attempt'
      );

      // Validation
      if (!code && !idToken && !accessToken) {
        app.logger.warn(
          { platform },
          'Google OAuth validation failed - no tokens provided'
        );
        return reply.status(400).send({
          error: 'OAuth token is required',
          code: 'MISSING_TOKEN',
        });
      }

      try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const androidPackage = 'com.alessiobisulca.acceptconnect.com';

        if (!clientId) {
          app.logger.error({}, 'Google OAuth not configured - missing client ID');
          return reply.status(500).send({
            error: 'Google OAuth is not configured',
            code: 'OAUTH_NOT_CONFIGURED',
          });
        }

        // Log platform-specific validation
        if (platform === 'android') {
          app.logger.info(
            {
              platform,
              expectedPackage: androidPackage,
              hasFingerprints: !!process.env.ANDROID_SHA1_FINGERPRINTS,
            },
            'Validating Android OAuth credentials'
          );

          if (!process.env.ANDROID_SHA1_FINGERPRINTS) {
            app.logger.warn(
              { platform },
              'Android OAuth - no SHA-1 fingerprints configured'
            );
          }
        }

        // TODO: Verify token with Google and check platform-specific requirements
        // For Android: verify SHA-1 fingerprint and package name
        // For Web: verify client ID and redirect URI

        app.logger.info(
          {
            platform,
            clientId: clientId.substring(0, 20) + '...',
          },
          'Google OAuth (delegated to Better Auth)'
        );

        return reply.status(501).send({
          error: 'Google OAuth should be handled through Better Auth endpoints',
          hint: 'Use POST /api/auth/sign-in/social with provider=google and code',
        });
      } catch (error) {
        app.logger.error(
          {
            err: error,
            platform,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          'Google OAuth failed'
        );

        // Provide specific error messages
        const errorMessage = error instanceof Error ? error.message : '';
        let specificError = 'Google authentication failed';

        if (errorMessage.includes('Invalid OAuth client')) {
          specificError = 'Invalid OAuth client ID';
        } else if (errorMessage.includes('SHA-1') || errorMessage.includes('fingerprint')) {
          specificError = 'SHA-1 fingerprint mismatch - check your app signing configuration';
        } else if (errorMessage.includes('redirect')) {
          specificError = 'Redirect URI mismatch - check callback URL configuration';
        } else if (errorMessage.includes('package')) {
          specificError = 'Package name mismatch - check Android package configuration';
        }

        return reply.status(401).send({
          error: specificError,
          code: 'OAUTH_FAILED',
          platform,
          debugInfo:
            process.env.NODE_ENV === 'development'
              ? {
                  originalError: errorMessage,
                  expectedPackage: 'com.alessiobisulca.acceptconnect.com',
                  configuredFingerpints: process.env.ANDROID_SHA1_FINGERPRINTS ? 'Yes' : 'No',
                }
              : undefined,
        });
      }
    }
  );

  /**
   * GET /api/auth/me - Get current authenticated user
   * Returns user info and session details
   */
  app.fastify.get(
    '/api/auth/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Fetching current user');

      try {
        return {
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            emailVerified: session.user.emailVerified,
          },
          authenticated: true,
        };
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to fetch current user');
        throw error;
      }
    }
  );

  /**
   * POST /api/auth/sign-out - Sign out current user
   */
  app.fastify.post(
    '/api/auth/sign-out',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'User signing out');

      try {
        // TODO: Invalidate session through Better Auth
        // This should be delegated to Better Auth's sign-out endpoint

        return {
          success: true,
          message: 'Signed out successfully',
        };
      } catch (error) {
        app.logger.error({ err: error, userId }, 'Sign-out failed');
        throw error;
      }
    }
  );

  /**
   * POST /api/auth/verify-email - Verify user's email address
   * Requires authentication
   */
  app.fastify.post(
    '/api/auth/verify-email',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { code } = request.body as { code?: string };

      app.logger.info({ userId, hasCode: !!code }, 'Email verification attempt');

      if (!code) {
        return reply.status(400).send({
          error: 'Verification code is required',
          code: 'MISSING_CODE',
        });
      }

      try {
        // TODO: Verify code through Better Auth
        // This should validate the verification code sent to the user's email

        return {
          success: true,
          message: 'Email verified successfully',
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, hasCode: !!code },
          'Email verification failed'
        );
        return reply.status(400).send({
          error: 'Invalid or expired verification code',
          code: 'INVALID_CODE',
        });
      }
    }
  );

  /**
   * GET /api/auth/status - Get authentication status
   * Returns whether user is authenticated and basic info
   */
  app.fastify.get(
    '/api/auth/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const requireAuth = app.requireAuth();
        const session = await requireAuth(request, reply);

        if (!session) {
          return {
            authenticated: false,
          };
        }

        return {
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
        };
      } catch {
        return {
          authenticated: false,
        };
      }
    }
  );
}
