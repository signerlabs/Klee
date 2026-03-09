# macOS Packaging and Code Signing Guide

## Version Management
- Client version number is located in the `version` field of `client/package.json`.
- Before each release, manually update this field following semantic versioning (e.g., `0.1.1`, `0.2.0`).

## Environment Setup
1. Gather the four Apple credentials listed below. They all come from the same Apple Developer Program account that owns the Mac notarization certificate.
2. Add them to the project `.env` file so the build script can load them:
   ```
   APPLE_ID=your_apple_id@example.com
   APPLE_APP_SPECIFIC_PASSWORD=your_app_specific_password
   APPLE_TEAM_ID=YOUR_TEAM_ID
   CODESIGN_IDENTITY="Developer ID Application: Your Company Name (TEAMID)"
   ```
3. Double-check that the Apple Developer membership is active and the app-specific password is still valid before kicking off a release.

### APPLE_ID
- This is the email address that you use to sign in at <https://appleid.apple.com/> and <https://developer.apple.com/> for the team’s developer account.
- If you are unsure which address to use, log in to the Apple Developer website with your work Apple ID and confirm the email shown in the top-right account menu.

### APPLE_APP_SPECIFIC_PASSWORD
1. Browse to <https://appleid.apple.com/>.
2. Sign in with the Apple ID from the previous step and, if prompted, approve the login with two-factor authentication.
3. Open **Sign-In and Security → App-Specific Passwords**.
4. Click **Generate an app-specific password**, give it a name such as `Klee notarization`, and confirm.
5. Copy the 16-character password that Apple shows once. Paste it immediately into your `.env` file—Apple will not display it again.
   - If this field ever stops working, revoke the old password on the same page and generate a new one.

### APPLE_TEAM_ID
- Go to <https://developer.apple.com/account>, sign in, and open **Membership**. The **Team ID** is a 10-character string (letters and numbers) shown next to your organization name.
- Alternatively, in Xcode (if installed) open **Xcode → Settings → Accounts**, select the team, and read the **Team ID** value.

### CODESIGN_IDENTITY
- You need the Developer ID Application certificate stored in Keychain Access on the Mac that performs the build.
- Open **Keychain Access** (use Spotlight search), choose the **login** keychain, and filter by `Developer ID Application`.
- Locate the certificate that matches your organization (for example `Developer ID Application: Your Company Name (TEAMID)`) and copy its full name into the `.env` file.
- If you cannot find the certificate, sign in to <https://developer.apple.com/account/resources/certificates/list> on that Mac, download the `Developer ID Application` certificate, and double-click it so Keychain installs it. You may need a teammate with admin access to create or renew the certificate.

## Packaging Process
1. Execute from the project root:
   ```bash
   npm run build:mac
   ```
   The script will:
   - Automatically load `.env`;
   - Build the client;
   - Sign the embedded Ollama binary and main application;
   - Notarize and staple;
   - Verify with `codesign` / `spctl`.
2. After successful completion, artifacts will be located at:
   - `client/release/<version>/mac-arm64/Klee.app`
   - `client/release/<version>/Klee_<version>_arm64.dmg`
   - `latest-mac.yml`, `.blockmap`, and other release files.

## Release Notes
- The DMG is the distribution file and can be directly uploaded or attached to a Release.
- To support other architectures, you need to add the corresponding Ollama binaries and update `mac.binaries` in `electron-builder.json`.
- If Apple returns a notarization failure, check if credentials in `.env` have expired or if the certificate has been revoked.
