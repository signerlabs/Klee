# Klee Packaging and Deployment Guide

> Complete packaging and deployment process for both backend and client (Backend AWS EB + Client macOS)

---

## 1. Backend Deployment (AWS Elastic Beanstalk)

### 1.1 Prerequisites (First Time Only)

**Create IAM User**:
1. Login to [AWS Console](https://console.aws.amazon.com) → IAM → Users → Create User
2. Attach policies: `AWSElasticBeanstalkFullAccess` + `IAMReadOnlyAccess`
3. Create access key (record Access Key ID and Secret)

**Configure AWS CLI**:
```bash
aws configure
# Access Key ID: AKIA...
# Secret Access Key: wJalr...
# Region: us-east-1
# Output: json

# Verify
aws sts get-caller-identity
```

---

### 1.2 Initialize EB (First Time Only)

```bash
cd server
eb init klee-backend \
  --platform "Node.js 22 running on 64bit Amazon Linux 2023" \
  --region us-east-1

eb create klee-prod \
  --instance-type t3.small \
  --enable-spot
```

Wait 5-10 minutes.

---

### 1.3 Set Environment Variables (First Time Only)

```bash
# Run from project root
npm run server:deploy:setenv

# Verify
cd server && eb printenv
```

---

### 1.4 Deploy Backend

```bash
# Run from project root (one-click build + deploy)
npm run server:deploy
```

**Verify Health Check**:
```bash
curl https://klee-prod.eba-xxx.us-east-1.elasticbeanstalk.com/api/health
```

**Record Backend URL** (needed for client in next step):
```bash
npm run server:status
# CNAME: klee-prod.eba-xxx.us-east-1.elasticbeanstalk.com
```

---

## 2. Client Packaging (macOS .dmg)

### 2.1 Configure Backend URL (if changed)

**Default URL**: `https://your-eb-url.elasticbeanstalk.com`

If you use a different EB environment, edit `client/src/renderer/src/lib/hono-client.ts`:

```typescript
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return ''
  }
  return 'https://your-eb-url.elasticbeanstalk.com'  // 👈 Replace with your EB URL
}
```

---

### 2.2 Build Client

```bash
npm run client:build
```

After build completes, the .dmg file is located at:
```bash
client/release/0.1.0/mac-arm64/klee_0.1.0_arm64.dmg
```

**Check file size**:
```bash
du -h client/release/*/*.dmg
# Expected: < 200MB
```

---

### 2.3 Installation Testing

1. **Double-click the .dmg file**
2. **Drag to Applications**
3. **First launch**: Right-click the app → Select "Open" (because it's unsigned)
4. **Verify Cloud Mode**: Login and access cloud data
5. **Verify Private Mode**: Switch to Private Mode, create notes (fully offline)

---

## 3. Quick Command Reference

### Backend Deployment

```bash
# Daily updates
npm run server:deploy          # Build + deploy

# Monitoring
npm run server:status          # Check status
npm run server:logs            # View logs

# EB native commands (requires cd server)
eb status                      # Status
eb logs                        # Logs
eb console                     # Open AWS console
eb printenv                    # View environment variables
```

### Client Packaging

```bash
# Build
npm run client:build

# View generated files
ls -lh client/release/*/*.dmg
```

---

## 4. Troubleshooting

### Backend Health Shows Red
1. View logs: `npm run server:logs`
2. Check health endpoint: `curl https://[EB-URL]/api/health`
3. Verify environment variables: `cd server && eb printenv`

### Client Build Fails
1. Check Node.js version: `node --version` (requires 20+)
2. Clear cache: `cd client && rm -rf node_modules dist dist-electron release && npm install`
3. Rebuild: `npm run client:build`

### Client Cannot Connect to Backend
1. Check API_BASE_URL in `client/src/lib/hono-client.ts`
2. Verify backend health check: `curl https://[EB-URL]/api/health`
3. Check network connection

### macOS "Cannot open because it's from an unidentified developer"
**Solutions**:
- Right-click the app → Select "Open"
- Or: System Preferences → Security & Privacy → Click "Open Anyway"
- Or: Remove quarantine attribute: `xattr -cr /Applications/Klee.app`

---

## 5. Configuration Files

### electron-builder.json Key Configuration

```json
{
  "asar": true,
  "asarUnpack": [
    "node_modules/apache-arrow",      // LanceDB dependency
    "node_modules/@lancedb",
    "node_modules/better-sqlite3"     // SQLite native module
  ],
  "mac": {
    "target": ["dmg"],
    "hardenedRuntime": false,         // Skip signing (dev stage)
    "gatekeeperAssess": false
  }
}
```

**Note**: `asarUnpack` is used to exclude native modules from being packaged into the .asar archive.

---

## 6. Production Checklist

### Before Backend Deployment
- [ ] Environment variables are set (Supabase keys, database URL)
- [ ] Health check endpoint returns 200
- [ ] No errors in logs

### Before Client Packaging
- [ ] Backend URL is updated (`hono-client.ts`)
- [ ] Native modules are configured in `asarUnpack`
- [ ] .dmg file < 200MB

### Testing Verification
- [ ] Cloud Mode: Login → Create notes → Data syncs
- [ ] Private Mode: Go offline → Switch to Private Mode → Create notes → Data persists
- [ ] Restart app: Data still exists

---

## 7. Switching AWS Accounts

```bash
# Configure new account profile
aws configure --profile new-account

# Switch
export AWS_PROFILE=new-account
aws sts get-caller-identity

# Re-initialize (delete old config)
rm -rf server/.elasticbeanstalk
cd server
eb init klee-backend --platform "Node.js 22" --region us-east-1
eb create klee-prod --instance-type t3.small --enable-spot

# Re-deploy
npm run server:deploy:setenv
npm run server:deploy
```

---

## 8. Cost Optimization

```bash
# Use Spot instances (already enabled during creation, saves 70%)
eb create klee-prod --enable-spot

# Scale down instance count
cd server && eb scale 1

# Terminate during off-hours
eb terminate klee-prod
```

---

**Last Updated**: 2025-10-31
