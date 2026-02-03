# Accept Connect

A cross-platform mobile application for secure message exchange with proximity-based discovery, built with React Native and Expo.

This app was built using [Natively.dev](https://natively.dev) - a platform for creating mobile apps.

## 🔐 Authentication Setup

### Email/Password Authentication

Email/password authentication is enabled by default. Users can:
- Sign up with email or username + password (minimum 8 characters)
- Sign in with their credentials
- Use either email or username for login

### Google OAuth Configuration for Android APK

**IMPORTANT**: To enable Google Sign-In on Android builds, you MUST configure the SHA-1 fingerprint in Google Cloud Console.

#### Step 1: Get Your SHA-1 Fingerprint

**For Debug Builds:**
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**For Release Builds:**
```bash
keytool -list -v -keystore /path/to/your/release.keystore -alias your-key-alias
```

Copy the SHA-1 fingerprint from the output (looks like: `A1:B2:C3:D4:...`)

#### Step 2: Configure Google Cloud Console

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your project
3. Find or create an **OAuth 2.0 Client ID** for Android
4. Configure it with:
   - **Application type**: Android
   - **Package name**: `com.alessiobisulca.acceptconnect.com`
   - **SHA-1 certificate fingerprint**: Paste your SHA-1 from Step 1
5. Click **Save**

#### Step 3: Verify Configuration

- Ensure the Android OAuth Client ID is **active** and **linked** to your project
- You may need to add BOTH debug and release SHA-1 fingerprints (create separate OAuth clients or add multiple fingerprints)
- Wait a few minutes for changes to propagate

#### Step 4: Test Authentication

1. Build and install your APK on a physical device
2. Tap "Continue with Google"
3. Check the app logs for detailed error messages if it fails

### Troubleshooting Google Sign-In

If Google Sign-In fails, the app will now display detailed error messages including:

- **"Invalid OAuth client ID"** → Check that your client ID is correct in Google Cloud Console
- **"SHA-1 fingerprint mismatch"** → Verify you added the correct SHA-1 for your APK
- **"Redirect URI mismatch"** → Ensure the package name matches exactly
- **403 errors** → Usually indicates missing or incorrect SHA-1 configuration

**The app now shows detailed error messages** when authentication fails, so you'll know exactly what needs to be fixed.

## 🧪 Testing

### Test Accounts

Create test accounts using:
- **Username**: testuser1
- **Password**: Test123!

Then create a second account:
- **Username**: testuser2  
- **Password**: Test123!

## 🐛 Debugging

### Common Issues

1. **"Nothing happens when I tap Sign Up"**
   - Check that password is at least 8 characters
   - Look for error messages in the modal that appears
   - The app now shows detailed validation errors

2. **"Google Sign-In does nothing"**
   - Verify SHA-1 fingerprint is configured in Google Cloud Console
   - Check that package name matches exactly: `com.alessiobisulca.acceptconnect.com`
   - Ensure OAuth client is active in Google Cloud Console
   - The app will now show a detailed error message with setup instructions

3. **"401 Unauthorized errors"**
   - Session may have expired
   - Try signing out and signing in again
   - Check that backend URL is correct in app.json

## 📱 Current Configuration

- **Android Package Name**: `com.alessiobisulca.acceptconnect.com`
- **Backend URL**: `https://7c9k7xhwvj22br85s33967rfhuyq3fve.app.specular.dev`
- **Authentication**: Better Auth with email/password and Google OAuth

Made with 💙 for creativity.
