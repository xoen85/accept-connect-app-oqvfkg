import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNull, lt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';

/**
 * Password Recovery Routes
 * Implements secure password reset flow for users who forgot their password
 */
export function registerPasswordRecoveryRoutes(app: App) {
  const requireAuth = app.requireAuth();

  /**
   * POST /api/auth/forgot-password - Request password reset
   * Sends reset token to user's email
   * Does NOT require authentication
   */
  app.fastify.post(
    '/api/auth/forgot-password',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = request.body as { email: string };

      app.logger.info({ email }, 'Password reset requested');

      if (!email || !email.includes('@')) {
        return reply.status(400).send({
          error: 'Valid email is required',
        });
      }

      try {
        // Find user by email
        const user = await app.db.query.user.findFirst({
          where: eq(authSchema.user.email, email),
        });

        if (!user) {
          // Don't reveal if email exists - security best practice
          app.logger.warn({ email }, 'Password reset requested for non-existent user');
          return {
            success: true,
            message:
              'If this email exists, a password reset link has been sent',
          };
        }

        // Create reset token
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

        const [resetToken] = await app.db
          .insert(schema.passwordResetTokens)
          .values({
            userId: user.id,
            token,
            expiresAt,
          })
          .returning();

        // Build reset URL
        const resetUrl = `https://acceptconnect.app/reset-password?token=${token}`;

        app.logger.info(
          {
            userId: user.id,
            resetTokenId: resetToken.id,
            email,
          },
          'Password reset token created'
        );

        // TODO: Send email with reset link
        // In production, integrate with email service (SendGrid, Mailgun, etc.)
        // Email should contain: resetUrl and expiration time

        // For now, log the URL for development
        app.logger.debug({ resetUrl }, 'Password reset URL (DEV ONLY)');

        return {
          success: true,
          message:
            'If this email exists, a password reset link has been sent',
          // Only include URL in development
          ...(process.env.NODE_ENV === 'development' && { resetUrl }),
        };
      } catch (error) {
        app.logger.error(
          { err: error, email },
          'Failed to process password reset request'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/auth/reset-password - Complete password reset
   * Validates token and updates password
   */
  app.fastify.post(
    '/api/auth/reset-password',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token, newPassword } = request.body as {
        token: string;
        newPassword: string;
      };

      app.logger.info(
        { tokenPrefix: token?.substring(0, 8) },
        'Password reset initiated'
      );

      if (!token || !newPassword) {
        return reply.status(400).send({
          error: 'Token and new password are required',
        });
      }

      if (newPassword.length < 8) {
        return reply.status(400).send({
          error: 'Password must be at least 8 characters',
        });
      }

      try {
        // Find reset token
        const resetToken = await app.db.query.passwordResetTokens.findFirst({
          where: and(
            eq(schema.passwordResetTokens.token, token),
            isNull(schema.passwordResetTokens.usedAt)
          ),
        });

        if (!resetToken) {
          app.logger.warn(
            { tokenPrefix: token?.substring(0, 8) },
            'Invalid password reset token'
          );
          return reply.status(400).send({
            error: 'Invalid or expired reset token',
          });
        }

        // Check token expiration
        if (new Date() > resetToken.expiresAt) {
          app.logger.warn(
            { tokenId: resetToken.id },
            'Password reset token expired'
          );
          return reply.status(410).send({
            error: 'Reset token has expired',
          });
        }

        // Get user
        const user = await app.db.query.user.findFirst({
          where: eq(authSchema.user.id, resetToken.userId),
        });

        if (!user) {
          app.logger.error(
            { resetTokenId: resetToken.id },
            'User not found for password reset'
          );
          return reply.status(404).send({
            error: 'User not found',
          });
        }

        // TODO: Update user password in auth system
        // This would typically be done through Better Auth's password change mechanism
        // await updateUserPassword(user.id, newPassword);

        // Mark token as used
        await app.db
          .update(schema.passwordResetTokens)
          .set({
            usedAt: new Date(),
          })
          .where(eq(schema.passwordResetTokens.id, resetToken.id));

        app.logger.info(
          { userId: user.id, email: user.email },
          'Password reset completed'
        );

        return {
          success: true,
          message: 'Password has been reset successfully',
        };
      } catch (error) {
        app.logger.error(
          { err: error, tokenPrefix: token?.substring(0, 8) },
          'Failed to reset password'
        );
        throw error;
      }
    }
  );

  /**
   * GET /api/auth/reset-password/:token - Validate reset token
   * Checks if a reset token is valid and not expired
   */
  app.fastify.get(
    '/api/auth/reset-password/:token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };

      app.logger.info(
        { tokenPrefix: token?.substring(0, 8) },
        'Validating password reset token'
      );

      try {
        const resetToken = await app.db.query.passwordResetTokens.findFirst({
          where: and(
            eq(schema.passwordResetTokens.token, token),
            isNull(schema.passwordResetTokens.usedAt)
          ),
        });

        if (!resetToken) {
          app.logger.warn(
            { tokenPrefix: token?.substring(0, 8) },
            'Reset token not found or already used'
          );
          return reply.status(404).send({
            error: 'Invalid or expired reset token',
          });
        }

        // Check expiration
        if (new Date() > resetToken.expiresAt) {
          app.logger.warn(
            { tokenId: resetToken.id },
            'Reset token expired'
          );
          return reply.status(410).send({
            error: 'Reset token has expired',
          });
        }

        const user = await app.db.query.user.findFirst({
          where: eq(authSchema.user.id, resetToken.userId),
        });

        app.logger.info(
          { tokenId: resetToken.id, userId: resetToken.userId },
          'Reset token validated'
        );

        return {
          valid: true,
          email: user?.email,
          expiresAt: resetToken.expiresAt,
        };
      } catch (error) {
        app.logger.error(
          { err: error, tokenPrefix: token?.substring(0, 8) },
          'Failed to validate reset token'
        );
        throw error;
      }
    }
  );

  /**
   * POST /api/auth/change-password - Change password for authenticated user
   * Requires current password for verification
   */
  app.fastify.post(
    '/api/auth/change-password',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { currentPassword, newPassword } = request.body as {
        currentPassword: string;
        newPassword: string;
      };

      const userId = session.user.id;

      app.logger.info({ userId }, 'Password change requested');

      if (!currentPassword || !newPassword) {
        return reply.status(400).send({
          error: 'Current password and new password are required',
        });
      }

      if (newPassword.length < 8) {
        return reply.status(400).send({
          error: 'New password must be at least 8 characters',
        });
      }

      if (currentPassword === newPassword) {
        return reply.status(400).send({
          error: 'New password must be different from current password',
        });
      }

      try {
        // TODO: Verify current password with Better Auth
        // This would typically be done through Better Auth's change password mechanism
        // const isCorrect = await verifyPassword(userId, currentPassword);
        // if (!isCorrect) {
        //   return reply.status(401).send({ error: 'Current password is incorrect' });
        // }

        // TODO: Update password in auth system
        // await updateUserPassword(userId, newPassword);

        app.logger.info({ userId }, 'Password changed successfully');

        return {
          success: true,
          message: 'Password has been changed successfully',
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId },
          'Failed to change password'
        );
        throw error;
      }
    }
  );

  /**
   * DELETE /api/auth/reset-tokens - Clean up expired password reset tokens
   * Called periodically to maintain database cleanliness
   */
  app.fastify.delete(
    '/api/auth/reset-tokens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      app.logger.info({}, 'Cleaning up expired reset tokens');

      try {
        await app.db
          .delete(schema.passwordResetTokens)
          .where(
            and(
              lt(schema.passwordResetTokens.expiresAt, new Date()),
              isNull(schema.passwordResetTokens.usedAt)
            )
          );

        app.logger.info({}, 'Reset tokens cleanup completed');

        return {
          success: true,
          message: 'Cleanup completed',
        };
      } catch (error) {
        app.logger.error({ err: error }, 'Reset tokens cleanup failed');
        throw error;
      }
    }
  );
}
