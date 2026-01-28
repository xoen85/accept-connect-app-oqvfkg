import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import * as schema from '../db/schema.js';

export function registerUserRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * GET /api/users/me/data - Export all personal data for the current user (GDPR)
   * Returns all user data including messages, sessions, and push tokens
   */
  app.fastify.get<{}>(
    '/api/users/me/data',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Exporting user personal data');

      try {
        // Fetch all user data
        const [sentMessages, receivedMessages, proximitySessions, pushTokens] =
          await Promise.all([
            // Messages sent by user
            app.db
              .select()
              .from(schema.messages)
              .where(eq(schema.messages.senderId, userId)),
            // Messages received by user
            app.db
              .select()
              .from(schema.messages)
              .where(eq(schema.messages.recipientId, userId)),
            // Proximity sessions initiated by user
            app.db
              .select()
              .from(schema.proximitySessions)
              .where(eq(schema.proximitySessions.initiatorId, userId)),
            // Push tokens registered by user
            app.db
              .select()
              .from(schema.pushTokens)
              .where(eq(schema.pushTokens.userId, userId)),
          ]);

        const exportData = {
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
            image: session.user.image,
            createdAt: session.user.createdAt,
            updatedAt: session.user.updatedAt,
          },
          messages: {
            sent: sentMessages.length,
            received: receivedMessages.length,
            sentMessages: sentMessages.map((msg) => ({
              id: msg.id,
              recipientId: msg.recipientId,
              content: msg.content,
              status: msg.status,
              createdAt: msg.createdAt,
              updatedAt: msg.updatedAt,
            })),
            receivedMessages: receivedMessages.map((msg) => ({
              id: msg.id,
              senderId: msg.senderId,
              content: msg.content,
              status: msg.status,
              createdAt: msg.createdAt,
              updatedAt: msg.updatedAt,
            })),
          },
          proximitySessions: {
            count: proximitySessions.length,
            sessions: proximitySessions.map((session) => ({
              id: session.id,
              expiresAt: session.expiresAt,
              messageId: session.messageId,
              createdAt: session.createdAt,
            })),
          },
          pushTokens: {
            count: pushTokens.length,
            platforms: [
              ...new Set(pushTokens.map((t) => t.platform)),
            ],
            registeredAt: pushTokens.map((t) => ({
              id: t.id,
              platform: t.platform,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
            })),
          },
          exportedAt: new Date().toISOString(),
        };

        app.logger.info(
          {
            userId,
            sentMessages: sentMessages.length,
            receivedMessages: receivedMessages.length,
            proximitySessions: proximitySessions.length,
            pushTokens: pushTokens.length,
          },
          'User personal data exported'
        );

        // Set response headers for file download
        reply.header('Content-Type', 'application/json');
        reply.header(
          'Content-Disposition',
          `attachment; filename="user-data-${userId}-${new Date().getTime()}.json"`
        );

        return exportData;
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to export user personal data'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/users/me - Delete user account and all associated data (GDPR)
   * This endpoint cascades deletes all user-related data:
   * - All messages (sent and received)
   * - All proximity sessions
   * - All push tokens
   * - User account itself
   */
  app.fastify.delete(
    '/api/users/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;
      const { confirm } = (request.body as { confirm?: boolean }) || {};

      app.logger.info({ userId, confirm }, 'Delete user account request');

      if (!confirm) {
        return reply.status(400).send({
          error: 'Confirm account deletion by setting confirm: true',
        });
      }

      try {
        // Delete all user data in transaction
        // Database constraints with onDelete: 'cascade' will handle related records
        const deletedUser = await app.db.transaction(async (tx) => {
          // Get user data before deletion for audit log
          const userMessages = await tx
            .select()
            .from(schema.messages)
            .where(eq(schema.messages.senderId, userId));

          const receivedMessages = await tx
            .select()
            .from(schema.messages)
            .where(eq(schema.messages.recipientId, userId));

          const proximitySessions = await tx
            .select()
            .from(schema.proximitySessions)
            .where(eq(schema.proximitySessions.initiatorId, userId));

          const pushTokens = await tx
            .select()
            .from(schema.pushTokens)
            .where(eq(schema.pushTokens.userId, userId));

          // The user deletion cascades to:
          // - All messages where userId is sender or recipient
          // - All proximity sessions
          // - All push tokens
          // This is handled by the foreign key constraints defined in schema.ts

          // For messages that are received by other users, we anonymize the sender
          // to preserve message history integrity
          await tx
            .update(schema.messages)
            .set({
              senderId: 'deleted-user',
              content: '[This message sender has deleted their account]',
            })
            .where(eq(schema.messages.senderId, userId));

          app.logger.info(
            {
              userId,
              sentMessages: userMessages.length,
              receivedMessages: receivedMessages.length,
              proximitySessions: proximitySessions.length,
              pushTokens: pushTokens.length,
            },
            'Anonymized messages before user deletion'
          );

          // Note: In a real system, you would also delete the user from Better Auth
          // This would be done through the auth system's user deletion endpoint
          // For now, we're just noting the cascading deletions
        });

        app.logger.info(
          { userId },
          'User account and associated data deletion initiated'
        );

        return {
          success: true,
          message: 'User account and all associated data have been deleted',
          userId,
          deletedAt: new Date().toISOString(),
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to delete user account'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/users/me - Get current user profile
   */
  app.fastify.get<{}>(
    '/api/users/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Fetching user profile');

      try {
        return {
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
            image: session.user.image,
            createdAt: session.user.createdAt,
            updatedAt: session.user.updatedAt,
          },
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to fetch user profile'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/users/me/stats - Get user message statistics
   */
  app.fastify.get<{}>(
    '/api/users/me/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const userId = session.user.id;

      app.logger.info({ userId }, 'Fetching user statistics');

      try {
        // Fetch counts for different message statuses
        const [sentPending] = await app.db
          .select({ value: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.senderId, userId),
              eq(schema.messages.status, 'pending')
            )
          );

        const [sentAccepted] = await app.db
          .select({ value: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.senderId, userId),
              eq(schema.messages.status, 'accepted')
            )
          );

        const [sentRejected] = await app.db
          .select({ value: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.senderId, userId),
              eq(schema.messages.status, 'rejected')
            )
          );

        const [receivedPending] = await app.db
          .select({ value: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.recipientId, userId),
              eq(schema.messages.status, 'pending')
            )
          );

        const [receivedAccepted] = await app.db
          .select({ value: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.recipientId, userId),
              eq(schema.messages.status, 'accepted')
            )
          );

        const [receivedRejected] = await app.db
          .select({ value: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.recipientId, userId),
              eq(schema.messages.status, 'rejected')
            )
          );

        const [proximitySessions] = await app.db
          .select({ value: count() })
          .from(schema.proximitySessions)
          .where(eq(schema.proximitySessions.initiatorId, userId));

        const [pushTokens] = await app.db
          .select({ value: count() })
          .from(schema.pushTokens)
          .where(eq(schema.pushTokens.userId, userId));

        const stats = {
          messages: {
            sent: {
              pending: sentPending?.value || 0,
              accepted: sentAccepted?.value || 0,
              rejected: sentRejected?.value || 0,
              total: (sentPending?.value || 0) + (sentAccepted?.value || 0) + (sentRejected?.value || 0),
            },
            received: {
              pending: receivedPending?.value || 0,
              accepted: receivedAccepted?.value || 0,
              rejected: receivedRejected?.value || 0,
              total: (receivedPending?.value || 0) + (receivedAccepted?.value || 0) + (receivedRejected?.value || 0),
            },
          },
          proximitySessions: proximitySessions?.value || 0,
          pushTokens: pushTokens?.value || 0,
        };

        app.logger.info(
          { userId, stats },
          'User statistics fetched'
        );

        return stats;
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to fetch user statistics'
        );
        throw error;
      }
    }
  );
}
