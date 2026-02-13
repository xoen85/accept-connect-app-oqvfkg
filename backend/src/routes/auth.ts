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
 */
export function registerAuthRoutes(app: App) {
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
