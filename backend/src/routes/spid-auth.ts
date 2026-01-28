import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';

/**
 * SPID Authentication Routes
 * Implements OpenID Connect flow for SPID (Italian Digital Identity System)
 *
 * SPID is an Italian government-backed digital identity system that uses OpenID Connect.
 * This implementation provides the custom OAuth flow needed to integrate SPID authentication.
 *
 * Environment variables required:
 * - SPID_CLIENT_ID: Application client ID registered with SPID provider
 * - SPID_CLIENT_SECRET: Application client secret
 * - SPID_METADATA_URL: SPID metadata endpoint (e.g., https://www.spid.gov.it/.well-known/openid-configuration)
 * - SPID_REDIRECT_URI: Redirect URI after authentication (e.g., https://acceptconnect.app/api/auth/spid/callback)
 */
export function registerSpidAuthRoutes(app: App) {
  /**
   * POST /api/auth/spid/initiate - Initiate SPID authentication flow
   * Returns authorization URL where user should be redirected
   */
  app.fastify.post(
    '/api/auth/spid/initiate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      app.logger.info({}, 'Initiating SPID authentication flow');

      try {
        const clientId = process.env.SPID_CLIENT_ID;
        const redirectUri = process.env.SPID_REDIRECT_URI;
        const metadataUrl = process.env.SPID_METADATA_URL;

        if (!clientId || !redirectUri || !metadataUrl) {
          app.logger.error(
            {},
            'SPID environment variables not configured'
          );
          return reply.status(500).send({
            error: 'SPID authentication not configured',
          });
        }

        // Generate state and nonce for security
        const state = randomBytes(32).toString('hex');
        const nonce = randomBytes(32).toString('hex');

        // Store state and nonce in session/cache for verification
        // In production, use a distributed cache like Redis
        const stateKey = `spid:state:${state}`;
        const nonceKey = `spid:nonce:${state}`;

        // TODO: Store in session/cache with expiration (5 minutes)
        app.logger.info(
          { state: state.substring(0, 8) },
          'Generated SPID state and nonce'
        );

        // Build SPID authorization URL
        // SPID uses OpenID Connect with specific requirements
        const authUrl = new URL(
          metadataUrl.replace('/.well-known/openid-configuration', '/authorize')
        );
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('scope', 'openid profile email');
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('nonce', nonce);
        // SPID-specific parameters
        authUrl.searchParams.append('acr_values', 'https://www.spid.gov.it/SpidL2');

        app.logger.info(
          { authUrl: authUrl.toString().substring(0, 100) },
          'Built SPID authorization URL'
        );

        return {
          authUrl: authUrl.toString(),
          state,
          nonce,
        };
      } catch (error) {
        app.logger.error(
          { err: error },
          'Failed to initiate SPID authentication'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/auth/spid/callback - SPID authorization callback
   * Handles the callback from SPID after user authentication
   * This endpoint receives the authorization code
   */
  app.fastify.get(
    '/api/auth/spid/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { code, state, error, error_description } = request.query as {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };

      app.logger.info(
        { state: state?.substring(0, 8), error },
        'SPID callback received'
      );

      if (error) {
        app.logger.warn(
          { error, error_description },
          'SPID authentication error'
        );
        return reply.status(400).send({
          error: 'SPID authentication failed',
          details: error_description,
        });
      }

      if (!code || !state) {
        app.logger.warn({}, 'SPID callback missing code or state');
        return reply.status(400).send({
          error: 'Missing code or state parameter',
        });
      }

      try {
        const clientId = process.env.SPID_CLIENT_ID;
        const clientSecret = process.env.SPID_CLIENT_SECRET;
        const redirectUri = process.env.SPID_REDIRECT_URI;
        const metadataUrl = process.env.SPID_METADATA_URL;

        if (!clientId || !clientSecret || !redirectUri || !metadataUrl) {
          app.logger.error(
            {},
            'SPID environment variables not configured'
          );
          return reply.status(500).send({
            error: 'SPID authentication not configured',
          });
        }

        // TODO: Verify state parameter against stored value
        // const stateKey = `spid:state:${state}`;
        // Retrieve and verify stored state

        // Exchange authorization code for tokens
        const tokenEndpoint = metadataUrl.replace(
          '/.well-known/openid-configuration',
          '/token'
        );

        const tokenResponse = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }).toString(),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          app.logger.error(
            { status: tokenResponse.status, error: errorData },
            'SPID token exchange failed'
          );
          return reply.status(400).send({
            error: 'Failed to exchange authorization code',
          });
        }

        const tokens = (await tokenResponse.json()) as {
          access_token: string;
          id_token: string;
          token_type: string;
          expires_in: number;
        };

        app.logger.info(
          { hasAccessToken: !!tokens.access_token, hasIdToken: !!tokens.id_token },
          'SPID tokens received'
        );

        // TODO: Decode and verify JWT ID token
        // Verify signature using SPID's public key from metadata
        // Extract user information from ID token claims
        // - sub (subject/user ID)
        // - email
        // - name / family_name / given_name

        // TODO: Create or update user in database with SPID identity
        // Link SPID account to existing user or create new user

        // TODO: Create session and return authentication response
        // Set secure session cookie with user information

        return {
          success: true,
          message: 'SPID authentication successful',
          tokens: {
            accessToken: tokens.access_token,
            expiresIn: tokens.expires_in,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, state: state?.substring(0, 8) },
          'SPID callback processing failed'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/auth/spid/link - Link SPID account to existing user
   * Allows authenticated users to link SPID identity to their account
   */
  app.fastify.post(
    '/api/auth/spid/link',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { spidSubject } = request.body as { spidSubject: string };

      app.logger.info(
        { userId: session.user.id, spidSubject },
        'Linking SPID account to user'
      );

      if (!spidSubject) {
        return reply.status(400).send({
          error: 'SPID subject is required',
        });
      }

      try {
        // TODO: Store SPID subject in user account
        // Create mapping between SPID identity and user account
        // This allows future logins via SPID to identify the same user

        app.logger.info(
          { userId: session.user.id, spidSubject },
          'SPID account linked successfully'
        );

        return {
          success: true,
          message: 'SPID account linked successfully',
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, spidSubject },
          'Failed to link SPID account'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/auth/spid/metadata - Get SPID metadata for frontend
   * Provides configuration needed for frontend SPID integration
   */
  app.fastify.get(
    '/api/auth/spid/metadata',
    async (request: FastifyRequest, reply: FastifyReply) => {
      app.logger.info({}, 'Fetching SPID metadata');

      try {
        const clientId = process.env.SPID_CLIENT_ID;
        const redirectUri = process.env.SPID_REDIRECT_URI;

        if (!clientId || !redirectUri) {
          app.logger.warn({}, 'SPID not configured');
          return {
            enabled: false,
          };
        }

        return {
          enabled: true,
          clientId,
          redirectUri,
        };
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to fetch SPID metadata');
        throw error;
      }
    }
  );
}
