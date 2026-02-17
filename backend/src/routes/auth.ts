import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as authSchema from '../db/auth-schema.js';
import { randomBytes, randomUUID } from 'crypto';

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
 * - POST /api/user/oauth-session - Establish and verify OAuth session (CRITICAL after OAuth)
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
 *    - Register a custom deep link scheme (e.g., myapp://, exp://, acceptconnect://)
 *    - Example Expo: Add "scheme": "myapp" in app.json
 *    - For Android APK: Use your app's custom scheme (e.g., acceptconnect://)
 *
 * 2. Set OAuth Redirect URI in Provider Console
 *    IMPORTANT: Set this to your BACKEND OAuth callback endpoint, NOT the app's deep link!
 *    - Google: Add redirect URI like https://your-backend.com/api/auth/oauth-callback
 *    - Apple: Add redirect URI like https://your-backend.com/api/auth/oauth-callback
 *    - GitHub: Add redirect URI like https://your-backend.com/api/auth/oauth-callback
 *
 *    The backend will then redirect to your app's deep link with the token appended.
 *    Supported callback URL schemes on backend:
 *    - acceptconnect:// (Android native apps)
 *    - exp:// (Expo development apps)
 *    - http://localhost (local development)
 *    - https:// (production web)
 *
 * 3. Native App OAuth Flow (COMPLETE)
 *    a. User taps "Sign in with Google/Apple/GitHub"
 *    b. App opens browser with:
 *       POST /api/auth/sign-in/social with provider=google (gets OAuth URL)
 *    c. User completes OAuth (Apple/Google authenticates user)
 *    d. Browser redirects back to Better Auth's OAuth callback
 *    e. Better Auth creates session in database
 *    f. Frontend should call: GET /api/user/oauth-callback?redirect_to=myapp://home&provider=google
 *    g. This returns: 302 redirect to myapp://home?better_auth_token=abc123...&user_id=xyz...&provider=google
 *    h. App receives deep link with token in query params
 *    i. App IMMEDIATELY calls: POST /api/user/oauth-session (with Bearer token in header OR empty body)
 *       - This endpoint verifies the session exists
 *       - If no session, it creates one
 *       - Returns confirmed token and user data
 *    j. App stores token for future API calls (Authorization: Bearer <token>)
 *    k. App is now fully authenticated
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
 *   // Step 1: Get OAuth URL from backend
 *   const oauthResponse = await fetch('https://api.example.com/api/auth/sign-in/social', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       provider: 'google',
 *       redirectURL: redirectUrl,
 *       skipCSRFCheck: true
 *     })
 *   });
 *   const { url: oauthUrl } = await oauthResponse.json();
 *
 *   // Step 2: Open browser for OAuth (Apple/Google handles authentication)
 *   const result = await WebBrowser.openAuthSessionAsync(oauthUrl, redirectUrl);
 *
 *   if (result.type === 'success') {
 *     // Step 3: Get our callback endpoint to retrieve the token
 *     const callbackUrl = `https://api.example.com/api/user/oauth-callback?redirect_to=${encodeURIComponent(redirectUrl)}&provider=google`;
 *     const callbackResult = await fetch(callbackUrl);
 *
 *     // This redirects with better_auth_token in URL
 *     const finalUrl = callbackResult.url;
 *     const url = new URL(finalUrl);
 *     const token = url.searchParams.get('better_auth_token');
 *
 *     // Step 4: CRITICAL - Establish session on backend
 *     // This ensures the session is properly created and verified
 *     const sessionResponse = await fetch('https://api.example.com/api/user/oauth-session', {
 *       method: 'POST',
 *       headers: {
 *         'Content-Type': 'application/json',
 *         'Authorization': `Bearer ${token}`
 *       },
 *       body: JSON.stringify({ provider: 'google' })
 *     });
 *
 *     if (sessionResponse.ok) {
 *       const { token: verifiedToken, user } = await sessionResponse.json();
 *
 *       // Step 5: Save verified token (this is guaranteed to work)
 *       await AsyncStorage.setItem('auth_token', verifiedToken);
 *       await AsyncStorage.setItem('user', JSON.stringify(user));
 *
 *       // Now you can use the token for all API calls
 *       console.log('OAuth successful!', user);
 *     } else {
 *       // Session establishment failed
 *       console.error('Failed to establish session');
 *     }
 *   }
 * };
 *
 * // On app startup, verify token and restore session
 * const restoreSession = async () => {
 *   const token = await AsyncStorage.getItem('auth_token');
 *   if (!token) {
 *     // No session, show login screen
 *     return;
 *   }
 *
 *   // Verify token is still valid
 *   const response = await fetch(
 *     `https://api.example.com/api/user/verify-oauth-token?token=${token}`
 *   );
 *
 *   if (response.ok) {
 *     const { user } = await response.json();
 *     // Token valid, restore user state
 *     setUser(user);
 *   } else {
 *     // Token expired or invalid, clear and show login screen
 *     await AsyncStorage.removeItem('auth_token');
 *     await AsyncStorage.removeItem('user');
 *     setUser(null);
 *   }
 * };
 */
export function registerAuthRoutes(app: App) {
  /**
   * GET /api/user/oauth-callback - OAuth callback handler for native apps
   *
   * Supports custom mobile app deep-link schemes:
   * - acceptconnect:// (Android native app)
   * - acceptconnect://auth-callback
   * - acceptconnect://oauth-callback
   * - exp:// (Expo development/production)
   * - https:// (web/production)
   * - http://localhost (local development)
   *
   * After successful OAuth authentication, the native app deep link redirects back here.
   * This endpoint retrieves the current session and appends the session token to the redirect URL.
   *
   * Query params:
   * - redirect_to: The deep link URL to redirect back to
   * - provider: The OAuth provider used (google, apple, github)
   *
   * OAuth flow:
   * 1. App calls: POST /api/auth/sign-in/social with redirectURL=acceptconnect://auth-callback
   * 2. Better Auth returns OAuth URL
   * 3. App opens browser for OAuth
   * 4. User authenticates with provider
   * 5. Provider redirects to Better Auth's callback
   * 6. Better Auth creates session
   * 7. App calls: GET /api/user/oauth-callback?redirect_to=acceptconnect://auth-callback
   * 8. We append token and redirect
   * 9. Mobile OS routes to app via deep link with token in URL
   *
   * Example usage:
   * GET /api/user/oauth-callback?redirect_to=acceptconnect://auth-callback&provider=google
   * GET /api/user/oauth-callback?redirect_to=exp://nkbsfwi-anonymous-8081.exp.direct/--/&provider=google
   *
   * Response: 302 redirect to acceptconnect://auth-callback?better_auth_token=<token>&user_id=<id>&provider=google
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
          hasAuthHeader: !!request.headers.authorization,
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

      // Validate that redirect_to is a valid URL
      // Support:
      // - Native mobile app schemes: acceptconnect://*, exp://*
      // - Web development: http://localhost:*, http://127.0.0.1:*
      // - Production: https://* (including https://gn4vxb67x7uhv3udtqg6e6b28yhf5ga3.app.specular.dev)
      const isValidRedirectUrl = (url: string): boolean => {
        try {
          // Native mobile app custom schemes
          if (url.startsWith('acceptconnect://') || url.startsWith('exp://')) {
            return true;
          }

          // Web URLs - parse and validate origin
          const urlObj = new URL(url);
          const protocol = urlObj.protocol;
          const hostname = urlObj.hostname;
          const port = urlObj.port;

          // HTTP/HTTPS URLs
          if (protocol === 'http:' || protocol === 'https:') {
            // localhost on any port (development)
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
              return true;
            }

            // Production frontend domain
            if (hostname === 'gn4vxb67x7uhv3udtqg6e6b28yhf5ga3.app.specular.dev' && protocol === 'https:') {
              return true;
            }

            // Allow any other https:// URLs (future domains)
            if (protocol === 'https:') {
              return true;
            }

            // Allow http on localhost with specific ports
            if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
              return true;
            }
          }

          return false;
        } catch {
          return false;
        }
      };

      if (!isValidRedirectUrl(redirect_to)) {
        app.logger.warn(
          { redirectTo: redirect_to },
          'OAuth callback invalid redirect_to URL - unsupported scheme or format'
        );
        return reply.status(400).send({
          error: 'Invalid redirect_to URL. Supported: acceptconnect://, exp://, http://localhost:*, http://127.0.0.1:*, https://*',
          code: 'INVALID_REDIRECT_URL',
        });
      }

      try {
        // Try multiple methods to get the session
        let sessionData = null;
        let authenticatedUser = null;

        // Method 1: Check if there's an Authorization bearer token
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          sessionData = await app.db.query.session.findFirst({
            where: eq(authSchema.session.token, token),
          });

          if (sessionData) {
            app.logger.info(
              {
                userId: sessionData.userId,
                provider,
                source: 'bearer-token',
              },
              'OAuth callback session found via bearer token'
            );
          }
        }

        // Method 2: Try to get session from Better Auth cookie
        if (!sessionData) {
          const cookies = (request as any).cookies || {};
          const sessionToken =
            cookies['better-auth.session_token'] ||
            cookies['auth-token'] ||
            cookies['session'];

          if (sessionToken) {
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
        }

        // Method 3: Use requireAuth to check if user is authenticated
        // This will work if Better Auth has already set up the session via cookies
        if (!sessionData) {
          app.logger.debug(
            { redirectTo: redirect_to, provider },
            'No session token found, attempting authentication check'
          );

          try {
            const requireAuth = app.requireAuth();
            const session = await requireAuth(request, reply);

            if (session) {
              authenticatedUser = session.user;
              app.logger.info(
                {
                  userId: session.user.id,
                  provider,
                  source: 'authenticated-request',
                },
                'User is authenticated via Better Auth'
              );

              // Find the most recent session for this user
              const allSessions = await app.db
                .select()
                .from(authSchema.session)
                .where(eq(authSchema.session.userId, session.user.id));

              if (allSessions.length > 0) {
                // Get the most recently created session
                sessionData = allSessions.reduce((latest, current) =>
                  current.createdAt > latest.createdAt ? current : latest
                );

                app.logger.info(
                  {
                    userId: session.user.id,
                    sessionCount: allSessions.length,
                  },
                  'Found user sessions in database'
                );
              }
            }
          } catch (authError) {
            app.logger.debug(
              { error: authError instanceof Error ? authError.message : String(authError) },
              'Authentication check failed - user may not be authenticated yet'
            );
          }
        }

        // If still no session found, return error
        if (!sessionData || !sessionData.token) {
          app.logger.warn(
            { redirectTo: redirect_to, provider },
            'OAuth callback - no valid session found after all attempts'
          );
          return reply.status(401).send({
            error: 'No active session found. OAuth authentication may have failed. Please ensure you have completed the OAuth flow.',
            code: 'NO_SESSION',
            hint: 'The session should be created by Better Auth after OAuth completes. Check that cookies are being set correctly.',
          });
        }

        // Append token and metadata to redirect URL
        // Handle custom schemes (acceptconnect://, exp://) that don't parse with URL constructor
        let redirectUrl: string;
        try {
          // Try to use URL constructor for standard URLs
          const urlObj = new URL(redirect_to);
          urlObj.searchParams.set('better_auth_token', sessionData.token);
          urlObj.searchParams.set('user_id', sessionData.userId);
          urlObj.searchParams.set('provider', provider || 'unknown');
          redirectUrl = urlObj.toString();
        } catch {
          // Fallback for custom schemes - manually append query parameters
          const separator = redirect_to.includes('?') ? '&' : '?';
          const params = new URLSearchParams();
          params.set('better_auth_token', sessionData.token);
          params.set('user_id', sessionData.userId);
          params.set('provider', provider || 'unknown');
          redirectUrl = `${redirect_to}${separator}${params.toString()}`;
        }

        app.logger.info(
          {
            userId: sessionData.userId,
            provider,
            tokenLength: sessionData.token.length,
            redirectUrl: redirectUrl.replace(/better_auth_token=[^&]+/, 'better_auth_token=***'),
          },
          'OAuth callback successful - redirecting with token'
        );

        // Redirect with token in URL
        return reply.redirect(redirectUrl);
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
   * POST /api/user/oauth-session - Establish and verify OAuth session
   *
   * CRITICAL: Call this endpoint immediately after OAuth callback to ensure the session
   * is properly established on the backend.
   *
   * This endpoint:
   * 1. Checks if the user has an active authenticated session
   * 2. If no session exists, creates one
   * 3. Returns the session token that should be used for future API calls
   *
   * Body: (empty or optional)
   * {
   *   "provider": "google" | "apple" | "github" // optional, for logging
   * }
   *
   * Returns:
   * {
   *   "success": true,
   *   "token": "session_token",
   *   "user": { id, email, name, image, emailVerified, ... },
   *   "session": { expiresAt, createdAt }
   * }
   *
   * This is called automatically by the frontend after OAuth redirects.
   * The returned token should be stored in AsyncStorage/SecureStore.
   */
  app.fastify.post(
    '/api/user/oauth-session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { provider } = request.body as { provider?: string };

      app.logger.info(
        {
          provider,
          hasAuthHeader: !!request.headers.authorization,
        },
        'OAuth session establishment attempt'
      );

      try {
        // First, try to get authenticated user via Better Auth
        const requireAuth = app.requireAuth();
        const session = await requireAuth(request, reply);

        if (!session || !session.user) {
          app.logger.warn(
            { provider },
            'OAuth session - user not authenticated'
          );
          return reply.status(401).send({
            error: 'User not authenticated. OAuth may not have completed successfully.',
            code: 'NOT_AUTHENTICATED',
          });
        }

        const userId = session.user.id;
        app.logger.info(
          { userId, provider },
          'User authenticated, retrieving session'
        );

        // Get all sessions for this user
        const userSessions = await app.db
          .select()
          .from(authSchema.session)
          .where(eq(authSchema.session.userId, userId));

        // Find the most recent valid session
        let sessionData = userSessions.find(
          (s) => new Date() < s.expiresAt
        );

        // If no valid session exists, create one
        if (!sessionData) {
          app.logger.info(
            { userId, provider },
            'No valid session found, creating new session'
          );

          // Generate a new session token
          const newSessionToken = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

          const [created] = await app.db
            .insert(authSchema.session)
            .values({
              id: randomUUID(),
              token: newSessionToken,
              userId: userId,
              expiresAt: expiresAt,
              createdAt: new Date(),
              updatedAt: new Date(),
              ipAddress: request.ip,
              userAgent: (request.headers['user-agent'] || null) as string | null,
            })
            .returning();

          sessionData = created;

          app.logger.info(
            { userId, sessionId: created.id, provider },
            'New OAuth session created'
          );
        } else {
          app.logger.info(
            { userId, sessionId: sessionData.id, provider },
            'Using existing valid session'
          );
        }

        // Return session data
        return {
          success: true,
          token: sessionData.token,
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            emailVerified: session.user.emailVerified,
            createdAt: session.user.createdAt,
            updatedAt: session.user.updatedAt,
          },
          session: {
            expiresAt: sessionData.expiresAt,
            createdAt: sessionData.createdAt,
          },
        };
      } catch (error) {
        app.logger.error(
          {
            err: error,
            provider,
            message: error instanceof Error ? error.message : String(error),
          },
          'OAuth session establishment failed'
        );
        return reply.status(500).send({
          error: 'Failed to establish session',
          code: 'SESSION_ESTABLISHMENT_FAILED',
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
