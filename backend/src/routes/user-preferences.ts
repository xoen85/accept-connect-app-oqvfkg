import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

/**
 * User Preferences Routes
 * Manages user sharing preferences and settings
 */
export function registerUserPreferencesRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * GET /api/users/preferences - Get user sharing preferences
   */
  app.fastify.get(
    '/api/users/preferences',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Fetching user preferences');

      try {
        let preferences = await app.db.query.userSharingPreferences.findFirst({
          where: eq(schema.userSharingPreferences.userId, userId),
        });

        // Create default preferences if they don't exist
        if (!preferences) {
          const [created] = await app.db
            .insert(schema.userSharingPreferences)
            .values({
              userId,
              proximityEnabled: true,
              linkSharingEnabled: true,
              pushNotificationsEnabled: true,
              obfuscateLinks: true,
              allowedShareMethods: ['whatsapp'],
            })
            .returning();

          preferences = created;
          app.logger.info({ userId }, 'Created default user preferences');
        }

        return preferences;
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to fetch user preferences'
        );
        throw error;
      }
    }
  );

  /**
   * PUT /api/users/preferences - Update user sharing preferences
   */
  app.fastify.put(
    '/api/users/preferences',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      const {
        proximityEnabled,
        linkSharingEnabled,
        pushNotificationsEnabled,
        obfuscateLinks,
        allowedShareMethods,
      } = request.body as {
        proximityEnabled?: boolean;
        linkSharingEnabled?: boolean;
        pushNotificationsEnabled?: boolean;
        obfuscateLinks?: boolean;
        allowedShareMethods?: Array<'whatsapp' | 'email' | 'telegram' | 'sms'>;
      };

      app.logger.info(
        {
          userId,
          proximityEnabled,
          linkSharingEnabled,
          obfuscateLinks,
        },
        'Updating user preferences'
      );

      try {
        // Get existing preferences or create new ones
        let prefs = await app.db.query.userSharingPreferences.findFirst({
          where: eq(schema.userSharingPreferences.userId, userId),
        });

        if (!prefs) {
          const [created] = await app.db
            .insert(schema.userSharingPreferences)
            .values({
              userId,
              proximityEnabled: proximityEnabled ?? true,
              linkSharingEnabled: linkSharingEnabled ?? true,
              pushNotificationsEnabled: pushNotificationsEnabled ?? true,
              obfuscateLinks: obfuscateLinks ?? true,
              allowedShareMethods: allowedShareMethods ?? ['whatsapp'],
            })
            .returning();

          app.logger.info({ userId }, 'Created user preferences');
          return created;
        }

        // Update existing preferences
        const updates: Record<string, any> = {};
        if (proximityEnabled !== undefined) updates.proximityEnabled = proximityEnabled;
        if (linkSharingEnabled !== undefined) updates.linkSharingEnabled = linkSharingEnabled;
        if (pushNotificationsEnabled !== undefined)
          updates.pushNotificationsEnabled = pushNotificationsEnabled;
        if (obfuscateLinks !== undefined) updates.obfuscateLinks = obfuscateLinks;
        if (allowedShareMethods !== undefined) updates.allowedShareMethods = allowedShareMethods;
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
        }

        const [updated] = await app.db
          .update(schema.userSharingPreferences)
          .set(updates)
          .where(eq(schema.userSharingPreferences.userId, userId))
          .returning();

        app.logger.info({ userId }, 'User preferences updated');
        return updated;
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to update user preferences'
        );
        throw error;
      }
    }
  );

  /**
   * PATCH /api/users/preferences/share-methods - Update sharing methods
   */
  app.fastify.patch(
    '/api/users/preferences/share-methods',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      const { allowedShareMethods } = request.body as {
        allowedShareMethods: Array<'whatsapp' | 'email' | 'telegram' | 'sms'>;
      };

      app.logger.info(
        { userId, methods: allowedShareMethods },
        'Updating share methods'
      );

      if (!Array.isArray(allowedShareMethods) || allowedShareMethods.length === 0) {
        return reply.status(400).send({
          error: 'At least one share method must be enabled',
        });
      }

      const validMethods = ['whatsapp', 'email', 'telegram', 'sms'];
      if (!allowedShareMethods.every((m) => validMethods.includes(m))) {
        return reply.status(400).send({
          error: 'Invalid share method provided',
        });
      }

      try {
        let prefs = await app.db.query.userSharingPreferences.findFirst({
          where: eq(schema.userSharingPreferences.userId, userId),
        });

        if (!prefs) {
          const [created] = await app.db
            .insert(schema.userSharingPreferences)
            .values({
              userId,
              allowedShareMethods,
            })
            .returning();

          return created;
        }

        const [updated] = await app.db
          .update(schema.userSharingPreferences)
          .set({
            allowedShareMethods,
            updatedAt: new Date(),
          })
          .where(eq(schema.userSharingPreferences.userId, userId))
          .returning();

        app.logger.info(
          { userId, methods: allowedShareMethods },
          'Share methods updated'
        );

        return updated;
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to update share methods'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/users/preferences/reset - Reset preferences to defaults
   */
  app.fastify.post(
    '/api/users/preferences/reset',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Resetting user preferences');

      try {
        const [updated] = await app.db
          .update(schema.userSharingPreferences)
          .set({
            proximityEnabled: true,
            linkSharingEnabled: true,
            pushNotificationsEnabled: true,
            obfuscateLinks: true,
            allowedShareMethods: ['whatsapp'],
            updatedAt: new Date(),
          })
          .where(eq(schema.userSharingPreferences.userId, userId))
          .returning();

        app.logger.info({ userId }, 'User preferences reset');
        return updated;
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to reset user preferences'
        );
        throw error;
      }
    }
  );
}
