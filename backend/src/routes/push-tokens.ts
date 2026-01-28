import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema.js';

export function registerPushTokenRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/push-tokens - Register a push notification token
   * Allows devices to register their push notification tokens
   */
  app.fastify.post(
    '/api/push-tokens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { token, platform } = request.body as {
        token: string;
        platform: 'ios' | 'android';
      };

      app.logger.info(
        { userId: session.user.id, platform, hasToken: !!token },
        'Registering push token'
      );

      if (!token || token.trim().length === 0) {
        return reply.status(400).send({ error: 'Token is required' });
      }

      if (!['ios', 'android'].includes(platform)) {
        return reply.status(400).send({
          error: 'Platform must be either ios or android',
        });
      }

      try {
        // Check if token already exists for this user
        const existing = await app.db.query.pushTokens.findFirst({
          where: eq(schema.pushTokens.token, token),
        });

        if (existing && existing.userId === session.user.id) {
          // Token already registered for this user, update timestamp
          const [updated] = await app.db
            .update(schema.pushTokens)
            .set({
              updatedAt: new Date(),
            })
            .where(eq(schema.pushTokens.id, existing.id))
            .returning();

          app.logger.info(
            { pushTokenId: updated.id, userId: session.user.id },
            'Push token already registered, updated'
          );

          return updated;
        } else if (existing) {
          // Token exists for different user - replace it
          const [updated] = await app.db
            .update(schema.pushTokens)
            .set({
              userId: session.user.id,
              platform,
              updatedAt: new Date(),
            })
            .where(eq(schema.pushTokens.id, existing.id))
            .returning();

          app.logger.info(
            {
              pushTokenId: updated.id,
              userId: session.user.id,
              previousUserId: existing.userId,
            },
            'Push token reassigned to new user'
          );

          return updated;
        }

        // Create new push token
        const [pushToken] = await app.db
          .insert(schema.pushTokens)
          .values({
            userId: session.user.id,
            token,
            platform,
          })
          .returning();

        app.logger.info(
          { pushTokenId: pushToken.id, userId: session.user.id, platform },
          'Push token registered successfully'
        );

        return pushToken;
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, platform },
          'Failed to register push token'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/push-tokens - List all push tokens for current user
   */
  app.fastify.get(
    '/api/push-tokens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { platform } = request.query as { platform?: 'ios' | 'android' };

      app.logger.info(
        { userId: session.user.id, platform },
        'Fetching push tokens'
      );

      try {
        let pushTokens;

        if (platform) {
          pushTokens = await app.db
            .select()
            .from(schema.pushTokens)
            .where(
              and(
                eq(schema.pushTokens.userId, session.user.id),
                eq(schema.pushTokens.platform, platform)
              )
            );
        } else {
          pushTokens = await app.db
            .select()
            .from(schema.pushTokens)
            .where(eq(schema.pushTokens.userId, session.user.id));
        }

        app.logger.info(
          { userId: session.user.id, count: pushTokens.length },
          'Push tokens fetched'
        );

        // Return tokens without exposing actual token values (for security)
        return pushTokens.map(({ token, ...rest }) => ({
          ...rest,
          tokenRegistered: true,
        }));
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to fetch push tokens'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/push-tokens/:id - Remove a push notification token
   */
  app.fastify.delete(
    '/api/push-tokens/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };

      app.logger.info(
        { pushTokenId: id, userId: session.user.id },
        'Deleting push token'
      );

      try {
        // Verify ownership
        const pushToken = await app.db.query.pushTokens.findFirst({
          where: eq(schema.pushTokens.id, id),
        });

        if (!pushToken) {
          return reply.status(404).send({ error: 'Push token not found' });
        }

        if (pushToken.userId !== session.user.id) {
          return reply.status(403).send({
            error: 'Not authorized to delete this push token',
          });
        }

        const [deleted] = await app.db
          .delete(schema.pushTokens)
          .where(eq(schema.pushTokens.id, id))
          .returning();

        app.logger.info(
          { pushTokenId: id, userId: session.user.id },
          'Push token deleted'
        );

        return { success: true, deleted };
      } catch (error) {
        app.logger.error(
          { err: error, pushTokenId: id, userId: session.user.id },
          'Failed to delete push token'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/notifications/send - Send a push notification to a user
   * Internal endpoint for triggering notifications when messages are received
   * In a production system, this would integrate with APNs (Apple) and FCM (Google)
   */
  app.fastify.post(
    '/api/notifications/send',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // This endpoint would typically be called by internal services
      // For now, we'll require authentication but in production could use API keys
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { recipientId, title, body, messageId } = request.body as {
        recipientId: string;
        title: string;
        body: string;
        messageId?: string;
      };

      app.logger.info(
        {
          senderId: session.user.id,
          recipientId,
          messageId,
          hasTitle: !!title,
        },
        'Sending push notification'
      );

      if (!recipientId || !title || !body) {
        return reply.status(400).send({
          error: 'recipientId, title, and body are required',
        });
      }

      try {
        // Fetch all push tokens for the recipient
        const pushTokens = await app.db
          .select()
          .from(schema.pushTokens)
          .where(eq(schema.pushTokens.userId, recipientId));

        if (pushTokens.length === 0) {
          app.logger.info(
            { recipientId },
            'No push tokens found for recipient'
          );
          return {
            success: true,
            delivered: 0,
            message:
              'No push tokens registered for recipient',
          };
        }

        // In production, you would integrate with:
        // - APNs (Apple Push Notification service) for iOS tokens
        // - FCM (Firebase Cloud Messaging) for Android tokens
        // For now, we'll just log what would be sent

        const sentCount = pushTokens.length;

        pushTokens.forEach((pushToken) => {
          app.logger.info(
            {
              recipientId,
              pushTokenId: pushToken.id,
              platform: pushToken.platform,
              messageId,
            },
            `Would send ${pushToken.platform} push notification`
          );
        });

        app.logger.info(
          { recipientId, count: sentCount, messageId },
          'Push notifications sent to recipient'
        );

        return {
          success: true,
          delivered: sentCount,
          platforms: [
            ...new Set(pushTokens.map((t) => t.platform)),
          ],
        };
      } catch (error) {
        app.logger.error(
          { err: error, recipientId, messageId },
          'Failed to send push notification'
        );
        throw error;
      }
    }
  );
}
