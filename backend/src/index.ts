import { createApplication } from "@specific-dev/framework";
import * as appSchema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerProximityRoutes } from './routes/proximity.js';
import { registerPushTokenRoutes } from './routes/push-tokens.js';
import { registerUserRoutes } from './routes/users.js';
import { registerSpidAuthRoutes } from './routes/spid-auth.js';
import { registerDeviceDiscoveryRoutes } from './routes/device-discovery.js';
import { registerUserPreferencesRoutes } from './routes/user-preferences.js';
import { registerPasswordRecoveryRoutes } from './routes/password-recovery.js';
import { registerSharingRoutes } from './routes/sharing.js';
import { registerOAuthProfileRoutes } from './routes/oauth-profile.js';
import { registerLocationRoutes } from './routes/location.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerAuthRoutes } from './routes/auth.js';

// Combine app and auth schemas
const schema = { ...appSchema, ...authSchema };

// Create application with combined schema
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Enable authentication with Better Auth
// Supports: Google (Web + Android), Apple, GitHub + Email/Password
// Email/password authentication is enabled by default in Better Auth
// For SPID (Italian Digital Identity): implement custom OpenID Connect endpoint separately
app.withAuth({
  socialProviders: {
    // Google OAuth (supports Web and Android builds)
    // For Android: Package name is com.alessiobisulca.acceptconnect.com
    // SHA-1 fingerprints are configured via environment variables
    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // Note: Android authentication uses the same OAuth client ID with SHA-1 fingerprint verification
          // Package name: com.alessiobisulca.acceptconnect.com
          // Configure development and production SHA-1 fingerprints via ANDROID_SHA1_FINGERPRINTS env var
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
registerDeviceDiscoveryRoutes(app);
registerUserPreferencesRoutes(app);
registerPasswordRecoveryRoutes(app);
registerSharingRoutes(app);
registerOAuthProfileRoutes(app);
registerLocationRoutes(app);
registerConnectionRoutes(app);
registerAuthRoutes(app);

await app.run();
app.logger.info('Application running');
