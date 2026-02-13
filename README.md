# Accept Connect

A secure message exchange platform with acceptance workflow. Send messages that require explicit acceptance or rejection.

This app was built using [Natively.dev](https://natively.dev) - a platform for creating mobile apps.

## Features

- 🔐 **Email/Password Authentication** - Sign up with email or username
- 🌐 **OAuth Support** - Google, Apple (iOS), and GitHub sign-in
- 📍 **GPS-based Connections** - Connect with nearby users
- 📱 **Bluetooth Discovery** - Find nearby devices with the app
- 🔗 **Secure Link Sharing** - Share messages via secure links
- 🔒 **GDPR Compliant** - View and delete your data anytime

## Authentication

### Email/Password Authentication

The app supports both email and username-based authentication:

#### Sign Up
- **With Email**: Enter your email address and password (min 8 characters)
- **With Username**: Enter a username and password (min 8 characters)
  - Username-based accounts use a synthetic email format: `username@acceptconnect.local`
  - Your username is stored in the 'name' field

#### Sign In
- Enter your email or username and password
- The app automatically detects whether you're using email or username format

#### Test Credentials

Create test accounts to try the app:

**Account 1:**
- Username: `testuser1`
- Password: `testpass123`

**Account 2:**
- Username: `testuser2`
- Password: `testpass123`

### OAuth Authentication

#### Google Sign-In
- **Web**: Opens popup window for Google authentication
- **Native**: Uses deep linking for OAuth flow
- **Android**: Requires SHA-1 fingerprint configuration (see below)

#### Apple Sign-In (iOS only)
- Available on iOS devices
- Uses native Apple authentication

#### GitHub Sign-In
- Available on all platforms
- Opens GitHub OAuth flow

### Android Google OAuth Setup

To enable Google Sign-In on Android builds:

1. **Get SHA-1 Fingerprint:**
   ```bash
   # Debug builds
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   
   # Release builds
   keytool -list -v -keystore /path/to/your/release.keystore -alias your-key-alias
   ```

2. **Configure Google Cloud Console:**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Select your OAuth 2.0 Client ID for Android
   - Add the SHA-1 fingerprint
   - Package name: `com.alessiobisulca.acceptconnect.com`

3. **Verify Configuration:**
   - Ensure Android OAuth Client ID is active
   - Check that the package name matches
   - Test authentication and check logs for errors

## Backend API

The backend is deployed at: `https://7c9k7xhwvj22br85s33967rfhuyq3fve.app.specular.dev`

### Authentication Endpoints

- `POST /api/auth/sign-up/email` - Create new account
  - Body: `{ email: string, password: string, name?: string }`
  - Returns: Session with user and token

- `POST /api/auth/sign-in/email` - Sign in
  - Body: `{ email: string, password: string }`
  - Returns: Session with user and token

- `GET /api/auth/get-session` - Get current session
  - Headers: `Authorization: Bearer <token>`
  - Returns: Current user session

- `POST /api/auth/sign-out` - Sign out
  - Headers: `Authorization: Bearer <token>`
  - Returns: Success confirmation

### Protected Endpoints

All API endpoints require authentication via Bearer token:

```javascript
Authorization: Bearer <token>
```

The token is automatically included in requests when using the `authenticatedGet`, `authenticatedPost`, etc. helpers from `utils/api.ts`.

## Session Management

### Storage
- **Web**: localStorage
- **Native**: Expo SecureStore

### Persistence
- Sessions persist across app restarts
- Tokens are automatically refreshed
- User state is managed by AuthContext

### Security
- Bearer tokens are stored securely
- Tokens are included in all authenticated requests
- Sessions expire after inactivity

## Development

### Prerequisites
- Node.js 18+
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
npm install
```

### Running the App

```bash
# Start Expo dev server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web
```

### Environment Variables

The backend URL is configured in `app.json`:

```json
{
  "expo": {
    "extra": {
      "backendUrl": "https://7c9k7xhwvj22br85s33967rfhuyq3fve.app.specular.dev"
    }
  }
}
```

## Testing Authentication

### Test Flow

1. **Sign Up:**
   - Open the app
   - Tap "Sign Up"
   - Enter username: `testuser1`
   - Enter password: `testpass123`
   - Tap "Sign Up"
   - You should be redirected to the home screen

2. **Sign Out:**
   - Go to Profile tab
   - Tap "Sign Out"
   - Confirm sign out
   - You should be redirected to the auth screen

3. **Sign In:**
   - Enter username: `testuser1`
   - Enter password: `testpass123`
   - Tap "Sign In"
   - You should be redirected to the home screen

4. **Session Persistence:**
   - Close the app completely
   - Reopen the app
   - You should still be signed in (no redirect to auth screen)

### Testing GPS Connections

1. Create two test accounts (testuser1 and testuser2)
2. Sign in with testuser1 on one device/emulator
3. Sign in with testuser2 on another device/emulator
4. Go to the Nearby tab on both devices
5. Enable location permissions
6. You should see each other in the nearby users list
7. Send a connection request
8. Accept the request on the other device
9. View active connections in the Profile tab

## Troubleshooting

### Authentication Issues

**Problem**: "Invalid credentials" error
- **Solution**: Ensure you're using the correct email/username and password
- Check if you signed up with email or username format
- Try the "Use email instead" / "Use username instead" toggle

**Problem**: Session not persisting
- **Solution**: Check browser/app storage permissions
- Clear app data and sign in again
- Check console logs for storage errors

**Problem**: Google Sign-In fails on Android
- **Solution**: Verify SHA-1 fingerprint is configured
- Check package name matches: `com.alessiobisulca.acceptconnect.com`
- Review Google Cloud Console OAuth configuration

### API Issues

**Problem**: "Backend URL not configured" error
- **Solution**: Rebuild the app after updating `app.json`
- The backend URL is read from `Constants.expoConfig?.extra?.backendUrl`

**Problem**: 401 Unauthorized errors
- **Solution**: Sign out and sign in again to refresh token
- Check that Bearer token is being sent in request headers
- Verify token is stored in SecureStore/localStorage

## Architecture

### Authentication Flow

```
┌─────────────┐
│  Auth Screen│
└──────┬──────┘
       │
       ├─ Email/Password ──> Better Auth ──> Database
       │                         │
       ├─ Google OAuth ────────> │
       │                         │
       ├─ Apple OAuth ─────────> │
       │                         │
       └─ GitHub OAuth ────────> │
                                 │
                                 ▼
                          ┌──────────────┐
                          │ Session Token│
                          └──────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐           ┌──────▼──────┐
              │SecureStore│           │ localStorage│
              │  (Native) │           │    (Web)    │
              └───────────┘           └─────────────┘
```

### API Integration

All API calls use the centralized `utils/api.ts` wrapper:

```typescript
import { authenticatedGet, authenticatedPost } from '@/utils/api';

// GET request
const data = await authenticatedGet('/api/users/me');

// POST request
const result = await authenticatedPost('/api/messages', { message: 'Hello' });
```

The wrapper automatically:
- Reads backend URL from `app.json`
- Includes Bearer token in headers
- Handles errors consistently
- Logs requests for debugging

## GDPR Compliance

### View Your Data
- Go to Profile tab
- Tap "View My Data"
- See all data stored about you

### Delete Your Account
- Go to Profile tab
- Tap "Delete Account"
- Confirm deletion
- All your data is permanently deleted

## License

Made with 💙 for creativity.
