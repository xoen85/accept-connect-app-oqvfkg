import { createApplication } from "@specific-dev/framework";
import * as appSchema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerProximityRoutes } from './routes/proximity.js';
import { registerPushTokenRoutes } from './routes/push-tokens.js';
import { registerUserRoutes } from './routes/users.js';
import { registerSpidAuthRoutes } from './routes/spid-auth.js';

// Combine app and auth schemas
const schema = { ...appSchema, ...authSchema };

// Create application with combined schema
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Enable authentication with Better Auth
// Supports: Google, Apple, GitHub + Email/Password
// For SPID (Italian Digital Identity): implement custom OpenID Connect endpoint separately
app.withAuth({
  socialProviders: {
    // Google OAuth (supports both proxy and custom credentials)
    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
      : undefined,
    // Apple OAuth (supports both proxy and custom credentials)
    apple: process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? {
          clientId: process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
        }
      : undefined,
    // GitHub OAuth (supports both proxy and custom credentials)
    github: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }
      : undefined,
  },
});

// Register routes - IMPORTANT: Always use registration functions to avoid circular dependency issues
registerMessageRoutes(app);
registerProximityRoutes(app);
registerPushTokenRoutes(app);
registerUserRoutes(app);
registerSpidAuthRoutes(app);

await app.run();
app.logger.info('Application running');
