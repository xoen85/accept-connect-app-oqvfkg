import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, or } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as schema from '../db/schema.js';

export function registerMessageRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/messages - Create a new message
   * Supports link-based, proximity-based, or direct message exchange
   */
  app.fastify.post('/api/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { content, recipientId, generateLink, linkExpiresIn, singleUse } =
      request.body as {
        content: string;
        recipientId?: string;
        generateLink?: boolean;
        linkExpiresIn?: number;
        singleUse?: boolean;
      };

    app.logger.info(
      {
        senderId: session.user.id,
        recipientId,
        generateLink,
        hasContent: !!content,
      },
      'Creating message'
    );

    if (!content || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Content is required' });
    }

    try {
      let linkToken: string | null = null;
      let linkExpiresAt: Date | null = null;

      if (generateLink) {
        // Generate secure link token
        linkToken = randomBytes(32).toString('hex');
        // Default expiration: 24 hours from now
        const expirationMs = linkExpiresIn || 24 * 60 * 60 * 1000;
        linkExpiresAt = new Date(Date.now() + expirationMs);
      }

      const [message] = await app.db
        .insert(schema.messages)
        .values({
          senderId: session.user.id,
          recipientId: recipientId || null,
          content,
          status: 'pending',
          linkToken,
          linkExpiresAt,
          singleUse: singleUse || false,
        })
        .returning();

      app.logger.info(
        { messageId: message.id, linkToken: !!linkToken },
        'Message created successfully'
      );

      // Return message with link if generated
      return {
        ...message,
        link: linkToken
          ? `${request.protocol}://${request.hostname}/api/messages/link/${linkToken}`
          : undefined,
      };
    } catch (error) {
      app.logger.error(
        { err: error, senderId: session.user.id, recipientId },
        'Failed to create message'
      );
      throw error;
    }
  });

  /**
   * GET /api/messages - List messages for current user
   * Returns both sent and received messages
   */
  app.fastify.get(
    '/api/messages',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { status, direction, limit = '50', offset = '0' } =
        request.query as {
          status?: 'pending' | 'accepted' | 'rejected';
          direction?: 'sent' | 'received';
          limit?: string;
          offset?: string;
        };

      app.logger.info(
        { userId: session.user.id, status, direction, limit, offset },
        'Fetching messages'
      );

      try {
        const limitNum = Math.min(parseInt(limit), 100);
        const offsetNum = parseInt(offset);

        let whereClause;

        if (direction === 'sent') {
          whereClause = eq(schema.messages.senderId, session.user.id);
        } else if (direction === 'received') {
          whereClause = eq(schema.messages.recipientId, session.user.id);
        } else {
          // Both sent and received
          whereClause = or(
            eq(schema.messages.senderId, session.user.id),
            eq(schema.messages.recipientId, session.user.id)
          );
        }

        // Add status filter if provided
        if (status) {
          whereClause = and(
            whereClause,
            eq(schema.messages.status, status)
          );
        }

        const messages = await app.db
          .select()
          .from(schema.messages)
          .where(whereClause)
          .limit(limitNum)
          .offset(offsetNum);

        app.logger.info(
          { userId: session.user.id, count: messages.length },
          'Messages fetched successfully'
        );

        return messages;
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          'Failed to fetch messages'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/messages/:id - Get a specific message by ID
   */
  app.fastify.get('/api/messages/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params as { id: string };

    app.logger.info(
      { messageId: id, userId: session.user.id },
      'Fetching message'
    );

    try {
      const message = await app.db.query.messages.findFirst({
        where: eq(schema.messages.id, id),
      });

      if (!message) {
        return reply.status(404).send({ error: 'Message not found' });
      }

      // Verify user is either sender or recipient
      if (
        message.senderId !== session.user.id &&
        message.recipientId !== session.user.id
      ) {
        return reply.status(403).send({ error: 'Not authorized' });
      }

      app.logger.info({ messageId: id }, 'Message fetched successfully');
      return message;
    } catch (error) {
      app.logger.error(
        { err: error, messageId: id, userId: session.user.id },
        'Failed to fetch message'
      );
      throw error;
    }
  });

  /**
   * GET /api/messages/link/:token - Get message by link token
   * Validates expiration and single-use constraint
   * Does NOT require authentication
   */
  app.fastify.get(
    '/api/messages/link/:token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };

      app.logger.info({ linkToken: token }, 'Accessing message via link');

      try {
        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.linkToken, token),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Link not found' });
        }

        // Check if link has expired
        if (message.linkExpiresAt && new Date() > message.linkExpiresAt) {
          app.logger.warn({ messageId: message.id }, 'Link expired');
          return reply.status(410).send({ error: 'Link has expired' });
        }

        // Check if single-use link has been used
        if (message.singleUse && message.linkUsed) {
          app.logger.warn({ messageId: message.id }, 'Single-use link already used');
          return reply.status(410).send({ error: 'Link has already been used' });
        }

        app.logger.info({ messageId: message.id }, 'Message link accessed');

        // Return message without sensitive link data
        const { linkToken, linkExpiresAt, linkUsed, ...safeMessage } = message;
        return safeMessage;
      } catch (error) {
        app.logger.error(
          { err: error, linkToken: token },
          'Failed to access message link'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/messages/:id/accept - Accept a message
   */
  app.fastify.post(
    '/api/messages/:id/accept',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };

      app.logger.info(
        { messageId: id, userId: session.user.id },
        'Accepting message'
      );

      try {
        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.id, id),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        // Verify user is the intended recipient
        if (
          message.recipientId &&
          message.recipientId !== session.user.id
        ) {
          return reply.status(403).send({ error: 'Not authorized to accept this message' });
        }

        // Update message status and mark link as used if accessed via link
        const [updated] = await app.db
          .update(schema.messages)
          .set({
            status: 'accepted',
            linkUsed: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.messages.id, id))
          .returning();

        app.logger.info(
          { messageId: id, userId: session.user.id },
          'Message accepted'
        );

        return updated;
      } catch (error) {
        app.logger.error(
          { err: error, messageId: id, userId: session.user.id },
          'Failed to accept message'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/messages/:id/reject - Reject a message
   */
  app.fastify.post(
    '/api/messages/:id/reject',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as { id: string };

      app.logger.info(
        { messageId: id, userId: session.user.id },
        'Rejecting message'
      );

      try {
        const message = await app.db.query.messages.findFirst({
          where: eq(schema.messages.id, id),
        });

        if (!message) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        // Verify user is the intended recipient
        if (
          message.recipientId &&
          message.recipientId !== session.user.id
        ) {
          return reply.status(403).send({ error: 'Not authorized to reject this message' });
        }

        // Update message status
        const [updated] = await app.db
          .update(schema.messages)
          .set({
            status: 'rejected',
            updatedAt: new Date(),
          })
          .where(eq(schema.messages.id, id))
          .returning();

        app.logger.info(
          { messageId: id, userId: session.user.id },
          'Message rejected'
        );

        return updated;
      } catch (error) {
        app.logger.error(
          { err: error, messageId: id, userId: session.user.id },
          'Failed to reject message'
        );
        throw error;
      }
    }
  );
}
