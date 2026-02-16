import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as authSchema from '../db/auth-schema.js';

/**
 * Custom Authentication Routes
 *
 * NOTE: /api/auth/* paths are reserved by Better Auth. These routes use /api/user/* instead.
 *
 * Better Auth provides these endpoints automatically:
 * - POST /api/auth/sign-up/email - Email/password sign-up
 * - POST /api/auth/sign-in/email - Email/password sign-in
 * - POST /api/auth/sign-out - Sign out
 * - POST /api/auth/change-password - Change password
 * - POST /api/auth/reset-password - Reset password
 * - GET /api/auth/get-session - Get current session
 *
 * This file provides additional features:
 * - POST /api/user/sign-in-with-username - Sign in using username instead of email
 * - GET /api/user/oauth-callback - OAuth callback handler for native apps with token in URL
 * - GET /api/user/verify-oauth-token - Verify and get session info from OAuth token
 *
 * ============================================================================
 * NATIVE APP OAUTH INTEGRATION GUIDE
 * ============================================================================
 *
 * For native apps (React Native / Expo), OAuth requires special handling because
 * the browser OAuth flow needs to redirect back to the app with authentication data.
 *
 * SETUP STEPS:
 * -----------
 *
 * 1. Configure Deep Links in Your Native App
 *    - Register a custom deep link scheme (e.g., myapp://, exp://)
 *    - Example Expo: Add "scheme": "myapp" in app.json
 *
 * 2. Set OAuth Redirect URI in Provider Console
 *    - Google: Add redirect URI like https://your-backend.com/oauth-callback
 *    - Apple: Add redirect URI like https://your-backend.com/oauth-callback
 *    - GitHub: Add redirect URI like https://your-backend.com/oauth-callback
 *
 * 3. Native App OAuth Flow
 *    a. User taps "Sign in with Google/Apple/GitHub"
 *    b. App opens browser with:
 *       https://your-backend.com/api/auth/sign-in/social?provider=google&redirect_uri=myapp://oauth-callback
 *    c. Better Auth handles OAuth exchange
 *    d. Browser redirects to: https://your-backend.com/oauth-callback
 *    e. Server validates credentials and creates session (cookie + DB record)
 *    f. Your app should then redirect to our custom callback handler:
 *       https://your-backend.com/api/user/oauth-callback?redirect_to=myapp://home&provider=google
 *    g. This endpoint appends the session token:
 *       myapp://home?better_auth_token=abc123...&user_id=xyz...&provider=google
 *    h. App receives deep link with token in query params
 *    i. App stores token for future API calls (Authorization: Bearer <token>)
 *
 * 4. Token Storage in Native App
 *    - Save the token to AsyncStorage or SecureStore
 *    - Use it for all future API requests: Authorization: Bearer <token>
 *    - On app restart, verify token validity with /api/user/verify-oauth-token
 *
 * EXAMPLE FLOW:
 * -----------
 *
 * // In React Native/Expo
 * const handleGoogleSignIn = async () => {
 *   const redirectUrl = Linking.createURL('oauth-callback');
 *
 *   // Open browser for OAuth
 *   const result = await WebBrowser.openAuthSessionAsync(
 *     `https://api.example.com/api/auth/sign-in/social?provider=google&redirect_uri=${encodeURIComponent(redirectUrl)}`,
 *     redirectUrl
 *   );
 *
 *   if (result.type === 'success') {
 *     const url = new URL(result.url);
 *     const token = url.searchParams.get('better_auth_token');
 *     const userId = url.searchParams.get('user_id');
 *
 *     // Save token
 *     await AsyncStorage.setItem('auth_token', token);
 *
 *     // Use token for API calls
 *     const response = await fetch('https://api.example.com/api/user/me', {
 *       headers: { 'Authorization': `Bearer ${token}` }
 *     });
 *   }
 * };
 *
 * // On app startup, verify token
 * const verifyToken = async () => {
 *   const token = await AsyncStorage.getItem('auth_token');
 *   if (!token) return;
 *
 *   const response = await fetch(`https://api.example.com/api/user/verify-oauth-token?token=${token}`);
 *   if (response.ok) {
 *     // Token valid, update user state
 *     const { user } = await response.json();
 *   } else {
 *     // Token expired or invalid, clear and show login screen
 *     await AsyncStorage.removeItem('auth_token');
 *   }
 * };
 */
export function registerAuthRoutes(app: App) {
  /**
   * GET /api/user/oauth-callback - OAuth callback handler for native apps
   *
   * After successful OAuth authentication, the native app deep link redirects back here.
   * This endpoint retrieves the current session and appends the session token to the redirect URL.
   *
   * Query params:
   * - redirect_to: The deep link URL to redirect back to (e.g., exp://nkbsfwi-anonymous-8081.exp.direct/--/)
   * - provider: The OAuth provider used (google, apple, github) - for logging
   *
   * Flow:
   * 1. Native app initiates OAuth sign-in
   * 2. Better Auth handles OAuth flow and creates session
   * 3. Native app deep link redirects to this callback
   * 4. We retrieve the session token from cookies or database
   * 5. We append token to redirect URL: redirect_to?better_auth_token=<token>
   * 6. Client redirects to the modified URL with token included
   *
   * Example usage:
   * GET /api/user/oauth-callback?redirect_to=exp://nkbsfwi-anonymous-8081.exp.direct/--/&provider=google
   *
   * Response: 302 redirect to exp://nkbsfwi-anonymous-8081.exp.direct/--/?better_auth_token=<token>&user_id=<id>&provider=google
   */
  app.fastify.get(
    '/api/user/oauth-callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { redirect_to, provider } = request.query as {
        redirect_to?: string;
        provider?: 'google' | 'apple' | 'github';
      };

      app.logger.info(
        {
          redirectTo: redirect_to,
          provider,
          cookieKeys: Object.keys((request as any).cookies || {}),
        },
        'OAuth callback initiated'
      );

      // Validate redirect_to parameter
      if (!redirect_to) {
        app.logger.warn({}, 'OAuth callback missing redirect_to parameter');
        return reply.status(400).send({
          error: 'redirect_to parameter is required',
          code: 'MISSING_REDIRECT',
        });
      }

      // Validate that redirect_to is a valid URL (basic check)
      try {
        new URL(redirect_to);
      } catch {
        app.logger.warn(
          { redirectTo: redirect_to },
          'OAuth callback invalid redirect_to URL'
        );
        return reply.status(400).send({
          error: 'Invalid redirect_to URL',
          code: 'INVALID_REDIRECT_URL',
        });
      }

      try {
        // First, try to get session from Better Auth cookie
        // Better Auth stores session in 'better-auth.session_token' cookie by default
        const cookies = (request as any).cookies || {};
        const sessionToken =
          cookies['better-auth.session_token'] ||
          cookies['auth-token'] ||
          cookies['session'];

        let sessionData = null;

        if (sessionToken) {
          // Query session table using the token
          sessionData = await app.db.query.session.findFirst({
            where: eq(authSchema.session.token, sessionToken),
          });

          if (sessionData) {
            app.logger.info(
              {
                userId: sessionData.userId,
                provider,
                source: 'cookie-token',
              },
              'OAuth callback session found via token cookie'
            );
          }
        }

        // If no session from cookie, try to authenticate current request
        if (!sessionData) {
          app.logger.debug(
            { redirectTo: redirect_to, provider },
            'No session token in cookies, attempting authentication check'
          );

          const requireAuth = app.requireAuth();
          const session = await requireAuth(request, reply);

          if (session) {
            // Find the session record in database for this user
            sessionData = await app.db.query.session.findFirst({
              where: eq(authSchema.session.userId, session.user.id),
            });

            if (sessionData) {
              app.logger.info(
                {
                  userId: session.user.id,
                  provider,
                  source: 'authenticated-request',
                },
                'OAuth callback session found via authenticated request'
              );
            }
          }
        }

        // If still no session found, return error
        if (!sessionData || !sessionData.token) {
          app.logger.warn(
            { redirectTo: redirect_to, provider },
            'OAuth callback - no valid session found'
          );
          return reply.status(401).send({
            error: 'No active session found. OAuth authentication may have failed.',
            code: 'NO_SESSION',
          });
        }

        // Append token and metadata to redirect URL
        const redirectUrl = new URL(redirect_to);
        redirectUrl.searchParams.set('better_auth_token', sessionData.token);
        redirectUrl.searchParams.set('user_id', sessionData.userId);
        redirectUrl.searchParams.set('provider', provider || 'unknown');

        app.logger.info(
          {
            userId: sessionData.userId,
            provider,
            tokenLength: sessionData.token.length,
            redirectUrl: redirectUrl.toString().replace(/better_auth_token=[^&]+/, 'better_auth_token=***'),
          },
          'OAuth callback successful - redirecting with token'
        );

        // Redirect with token in URL
        return reply.redirect(redirectUrl.toString());
      } catch (error) {
        app.logger.error(
          {
            err: error,
            redirectTo: redirect_to,
            provider,
            message: error instanceof Error ? error.message : String(error),
          },
          'OAuth callback processing failed'
        );
        return reply.status(500).send({
          error: 'OAuth callback processing failed',
          code: 'CALLBACK_FAILED',
        });
      }
    }
  );
  /**
   * GET /api/user/verify-oauth-token - Verify and retrieve session from OAuth token
   *
   * After receiving the OAuth callback with token in the URL, the native app can call this
   * endpoint to validate the token and get full session information.
   *
   * Query params:
   * - token: The session token from the OAuth callback redirect URL
   *
   * Returns full user and session information if token is valid.
   * This is useful for verifying the token was correctly received and setting up local storage.
   */
  app.fastify.get(
    '/api/user/verify-oauth-token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.query as { token?: string };

      if (!token) {
        app.logger.warn({}, 'OAuth token verification missing token');
        return reply.status(400).send({
          error: 'token query parameter is required',
          code: 'MISSING_TOKEN',
        });
      }

      app.logger.info(
        { tokenLength: token.length },
        'OAuth token verification attempt'
      );

      try {
        // Find session by token
        const sessionData = await app.db.query.session.findFirst({
          where: eq(authSchema.session.token, token),
        });

        if (!sessionData) {
          app.logger.warn(
            { tokenLength: token.length },
            'OAuth token verification failed - token not found'
          );
          return reply.status(401).send({
            error: 'Invalid or expired session token',
            code: 'INVALID_TOKEN',
          });
        }

        // Check if session has expired
        if (new Date() > sessionData.expiresAt) {
          app.logger.warn(
            { userId: sessionData.userId },
            'OAuth token verification failed - session expired'
          );
          return reply.status(401).send({
            error: 'Session has expired',
            code: 'SESSION_EXPIRED',
          });
        }

        // Get user data
        const user = await app.db.query.user.findFirst({
          where: eq(authSchema.user.id, sessionData.userId),
        });

        if (!user) {
          app.logger.error(
            { userId: sessionData.userId },
            'OAuth token verification - user not found'
          );
          return reply.status(500).send({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          });
        }

        app.logger.info(
          { userId: user.id, tokenValid: true },
          'OAuth token verification successful'
        );

        return {
          valid: true,
          token: token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          session: {
            expiresAt: sessionData.expiresAt,
            createdAt: sessionData.createdAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, tokenLength: token.length },
          'OAuth token verification failed'
        );
        return reply.status(500).send({
          error: 'Token verification failed',
          code: 'VERIFICATION_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/user/sign-in-with-username - Sign in using username (name field)
   * Body: { username: string, password: string }
   *
   * Better Auth only supports email-based sign-in by default.
   * This endpoint provides username-based login as an alternative.
   */
  app.fastify.post(
    '/api/user/sign-in-with-username',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as {
        username?: string;
        password?: string;
      };

      app.logger.info(
        {
          username,
          hasPassword: !!password,
          method: 'username/password',
        },
        'Username sign-in attempt'
      );

      // Validation
      if (!username || !password) {
        app.logger.warn(
          { hasUsername: !!username, hasPassword: !!password },
          'Sign-in validation failed - missing username or password'
        );
        return reply.status(400).send({
          error: 'Username and password are required',
          code: 'VALIDATION_ERROR',
        });
      }

      try {
        // Look up user by username (name field)
        const user = await app.db.query.user.findFirst({
          where: eq(authSchema.user.name, username),
        });

        if (!user) {
          app.logger.warn(
            { username },
            'Sign-in failed - user not found by username'
          );
          return reply.status(401).send({
            error: 'Invalid username or password',
            code: 'INVALID_CREDENTIALS',
          });
        }

        // Find the account with password hash for this user
        const account = await app.db.query.account.findFirst({
          where: eq(authSchema.account.userId, user.id),
        });

        if (!account || !account.password) {
          app.logger.warn(
            { userId: user.id, username },
            'Sign-in failed - no password auth method found'
          );
          return reply.status(401).send({
            error: 'Invalid username or password',
            code: 'INVALID_CREDENTIALS',
          });
        }

        app.logger.info(
          { userId: user.id, username },
          'Username found for sign-in - password verification delegated to Better Auth'
        );

        // Note: Password verification should be done through Better Auth
        // Client should use the email with /api/auth/sign-in/email endpoint
        // This endpoint locates the user by username, but the actual sign-in
        // should be completed with email/password through Better Auth
        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
          },
          message: 'Username found. Complete sign-in with email using /api/auth/sign-in/email endpoint',
          hint: 'Use email: ' + user.email,
        };
      } catch (error) {
        app.logger.error(
          { err: error, username, method: 'username/password' },
          'Username sign-in failed with server error'
        );
        return reply.status(500).send({
          error: 'Failed to sign in',
          code: 'SERVER_ERROR',
        });
      }
    }
  );

  /**
   * GET /api/user/me - Get current authenticated user
   * Returns user info and authentication status
   *
   * This is a convenience endpoint that wraps Better Auth's get-session
   */
  app.fastify.get(
    '/api/user/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Fetching current user profile');

      try {
        return {
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            emailVerified: session.user.emailVerified,
            createdAt: session.user.createdAt,
            updatedAt: session.user.updatedAt,
          },
          authenticated: true,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to fetch current user profile'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/user/auth-status - Get authentication status
   * Returns whether user is authenticated and basic info
   *
   * Non-protected endpoint that returns authentication status
   */
  app.fastify.get(
    '/api/user/auth-status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const requireAuth = app.requireAuth();
        const session = await requireAuth(request, reply);

        if (!session) {
          app.logger.debug({}, 'User not authenticated');
          return {
            authenticated: false,
          };
        }

        app.logger.debug({ userId: session.user.id }, 'User is authenticated');

        return {
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            emailVerified: session.user.emailVerified,
          },
        };
      } catch {
        return {
          authenticated: false,
        };
      }
    }
  );

  /**
   * POST /api/user/update-profile - Update user profile
   * Body: { name?: string }
   *
   * This is a convenience endpoint for updating user name/username
   */
  app.fastify.post(
    '/api/user/update-profile',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { name } = request.body as { name?: string };

      app.logger.info(
        { userId, hasName: !!name },
        'Updating user profile'
      );

      if (name && name.length > 256) {
        return reply.status(400).send({
          error: 'Name must not exceed 256 characters',
          code: 'NAME_TOO_LONG',
        });
      }

      try {
        // Check if new name is already taken by another user (if changing)
        if (name && name !== session.user.name) {
          const existingUser = await app.db.query.user.findFirst({
            where: eq(authSchema.user.name, name),
          });

          if (existingUser && existingUser.id !== userId) {
            app.logger.warn(
              { userId, newName: name },
              'Profile update failed - username already taken'
            );
            return reply.status(409).send({
              error: 'Username is already taken',
              code: 'USERNAME_TAKEN',
            });
          }
        }

        const updates: { name?: string; updatedAt: Date } = {
          updatedAt: new Date(),
        };
        if (name) {
          updates.name = name;
        }

        const [updated] = await app.db
          .update(authSchema.user)
          .set(updates)
          .where(eq(authSchema.user.id, userId))
          .returning();

        app.logger.info(
          { userId, newName: name },
          'User profile updated'
        );

        return {
          success: true,
          user: {
            id: updated.id,
            email: updated.email,
            name: updated.name,
            image: updated.image,
            emailVerified: updated.emailVerified,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, newName: name },
          'Failed to update profile'
        );
        return reply.status(500).send({
          error: 'Failed to update profile',
          code: 'SERVER_ERROR',
        });
      }
    }
  );
}
