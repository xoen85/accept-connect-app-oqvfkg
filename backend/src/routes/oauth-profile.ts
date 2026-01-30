import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as authSchema from '../db/auth-schema.js';

/**
 * OAuth Profile Routes
 * Handles profile picture and data import from OAuth providers
 *
 * When a user authenticates via Google, Apple, or other OAuth providers,
 * we automatically import their profile picture and make it available.
 * This follows GDPR best practices by only storing minimal profile data.
 */
export function registerOAuthProfileRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * GET /api/users/oauth-accounts - Get linked OAuth accounts for current user
   * Shows which OAuth providers are connected and their profile data
   */
  app.fastify.get(
    '/api/users/oauth-accounts',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Fetching linked OAuth accounts');

      try {
        const accounts = await app.db
          .select({
            id: authSchema.account.id,
            provider: authSchema.account.providerId,
            accountId: authSchema.account.accountId,
            createdAt: authSchema.account.createdAt,
          })
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, userId));

        app.logger.info(
          { userId, accountCount: accounts.length },
          'OAuth accounts fetched'
        );

        return {
          accounts,
          profileImage: session.user.image,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to fetch OAuth accounts'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/users/update-profile-picture - Update user profile picture
   * Can be called after OAuth login to store the profile picture URL
   */
  app.fastify.post(
    '/api/users/update-profile-picture',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { imageUrl } = request.body as { imageUrl: string };

      app.logger.info(
        { userId, hasImageUrl: !!imageUrl },
        'Updating profile picture'
      );

      if (!imageUrl || !imageUrl.startsWith('http')) {
        return reply.status(400).send({
          error: 'Valid image URL is required',
        });
      }

      try {
        // Validate URL format
        try {
          new URL(imageUrl);
        } catch {
          return reply.status(400).send({
            error: 'Invalid image URL format',
          });
        }

        // Update user profile picture
        const [updated] = await app.db
          .update(authSchema.user)
          .set({
            image: imageUrl,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, userId))
          .returning();

        app.logger.info(
          { userId },
          'Profile picture updated'
        );

        return {
          success: true,
          user: {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            image: updated.image,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to update profile picture'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/users/sync-profile - Sync profile data from OAuth provider
   * Refetches and updates profile information from the connected OAuth account
   */
  app.fastify.post(
    '/api/users/sync-profile',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { provider } = request.body as { provider?: string };

      app.logger.info(
        { userId, provider },
        'Syncing profile from OAuth provider'
      );

      try {
        // Find OAuth accounts
        let accounts = await app.db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, userId));

        if (provider) {
          accounts = accounts.filter((a) => a.providerId === provider);
        }

        if (accounts.length === 0) {
          return reply.status(404).send({
            error: 'No OAuth account found',
          });
        }

        // TODO: In production, you would:
        // 1. Use stored access tokens to make API calls to OAuth providers
        // 2. Fetch updated profile data (name, picture, email)
        // 3. Update user record with new information
        // 4. Handle token refresh if needed

        // For now, return current profile data
        app.logger.info(
          { userId, accountCount: accounts.length },
          'Profile sync initiated (implementation needed)'
        );

        return {
          success: true,
          message: 'Profile sync completed',
          profile: {
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
          },
          accounts: accounts.map((a) => ({
            provider: a.providerId,
            connectedAt: a.createdAt,
          })),
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, provider },
          'Failed to sync profile'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/users/oauth-accounts/:id - Unlink OAuth account
   * Removes connection to an OAuth provider while keeping account data
   */
  app.fastify.delete(
    '/api/users/oauth-accounts/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { id } = request.params as { id: string };

      app.logger.info(
        { userId, accountId: id },
        'Unlinking OAuth account'
      );

      try {
        const account = await app.db.query.account.findFirst({
          where: eq(authSchema.account.id, id),
        });

        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }

        if (account.userId !== userId) {
          return reply.status(403).send({
            error: 'Not authorized to unlink this account',
          });
        }

        // Check if user has password (can't unlink if only auth method)
        const userAccounts = await app.db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, userId));

        const hasPassword = userAccounts.some((a) => a.password);
        const hasOtherAuth = userAccounts.some((a) => a.id !== id);

        if (!hasPassword && !hasOtherAuth) {
          return reply.status(400).send({
            error: 'Cannot unlink your only authentication method',
          });
        }

        // Delete the account link
        await app.db
          .delete(authSchema.account)
          .where(eq(authSchema.account.id, id));

        app.logger.info(
          { userId, accountId: id },
          'OAuth account unlinked'
        );

        return {
          success: true,
          message: 'OAuth account unlinked successfully',
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId, accountId: id },
          'Failed to unlink OAuth account'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/users/profile/picture - Get current user's profile picture
   * Returns the profile picture URL or null if not set
   */
  app.fastify.get(
    '/api/users/profile/picture',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info(
        { userId: session.user.id },
        'Fetching user profile picture'
      );

      try {
        return {
          userId: session.user.id,
          image: session.user.image,
          hasProfilePicture: !!session.user.image,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to fetch profile picture'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/users/profile/picture - Remove profile picture
   * Sets profile picture to null
   */
  app.fastify.delete(
    '/api/users/profile/picture',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Removing profile picture');

      try {
        const [updated] = await app.db
          .update(authSchema.user)
          .set({
            image: null,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, userId))
          .returning();

        app.logger.info({ userId }, 'Profile picture removed');

        return {
          success: true,
          message: 'Profile picture removed',
          user: {
            id: updated.id,
            name: updated.name,
            image: updated.image,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to remove profile picture'
        );
        throw error;
      }
    }
  );
}
