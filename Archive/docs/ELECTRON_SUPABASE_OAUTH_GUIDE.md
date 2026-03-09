# Electron + Supabase OAuth Implementation Guide

**Concise Reference - For All Electron + Supabase Projects**

---

## 🎯 Core Principles

Key aspects of using Supabase OAuth in Electron apps:
1. **System browser** - Open OAuth page in system browser (not in Electron window)
2. **Deep link callback** - Use custom protocol (e.g., `myapp://auth/callback`)
3. **Main process handling** - Extract tokens and send to renderer process
4. **Create session** - Use `supabase.auth.setSession()`

---

## 📋 Implementation Steps

### 1. Register Custom Protocol

**electron-builder.json**:
```json
{
  "protocols": [
    {
      "name": "MyApp Protocol",
      "schemes": ["myapp"]
    }
  ]
}
```

**Main process** (`main/index.ts`):
```typescript
import { app, shell, ipcMain } from 'electron'

// Before app.whenReady()
if (process.defaultApp) {
  // Development environment
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [
      path.resolve(process.argv[1])
    ])
  }
} else {
  // Production environment
  app.setAsDefaultProtocolClient('myapp')
}
```

### 2. Main Process - Register IPC Handlers

```typescript
app.whenReady().then(() => {
  // 1. Open browser
  ipcMain.handle('oauth:openBrowser', async (_event, url: string) => {
    await shell.openExternal(url)
    return { success: true }
  })

  // ... other initialization code
})

// 2. Handle OAuth callback
function handleOAuthCallback(url: string) {
  const urlObj = new URL(url)

  if (urlObj.protocol === 'myapp:' && urlObj.pathname.includes('callback')) {
    // Extract tokens from hash (Supabase uses hash format)
    const accessToken = urlObj.hash.match(/access_token=([^&]*)/)?.[1]
    const refreshToken = urlObj.hash.match(/refresh_token=([^&]*)/)?.[1]

    if (accessToken && refreshToken) {
      // Send to renderer process
      mainWindow.webContents.send('oauth-success', { accessToken, refreshToken })
      mainWindow.focus()
    }
  }
}

// 3. Listen for deep link events
// macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleOAuthCallback(url)
})

// Windows/Linux
app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    mainWindow.focus()
  }
  const deepLinkUrl = commandLine.find((arg) => arg.startsWith('myapp://'))
  if (deepLinkUrl) {
    handleOAuthCallback(deepLinkUrl)
  }
})
```

### 3. Renderer Process - Initiate OAuth

**lib/auth.ts**:
```typescript
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'myapp://auth/callback',
      skipBrowserRedirect: true, // Critical: prevent automatic redirect
    },
  })

  if (error) throw error

  // Open in system browser via IPC
  if (window.electron?.ipcRenderer) {
    await window.electron.ipcRenderer.invoke('oauth:openBrowser', data.url)
  }
}

export async function createSessionFromOAuthTokens(
  accessToken: string,
  refreshToken: string
) {
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) throw error
}
```

### 4. Renderer Process - Listen for OAuth Callback

**App.tsx**:
```typescript
function App() {
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return

    const handleOAuthSuccess = async (_event, { accessToken, refreshToken }) => {
      try {
        await createSessionFromOAuthTokens(accessToken, refreshToken)
        // Navigate to home or show success message
        router.navigate({ to: '/' })
      } catch (error) {
        console.error('Failed to create session:', error)
      }
    }

    window.electron.ipcRenderer.on('oauth-success', handleOAuthSuccess)

    return () => {
      window.electron.ipcRenderer.off('oauth-success', handleOAuthSuccess)
    }
  }, [])

  return <YourApp />
}
```

### 5. Preload Script - Expose IPC

**preload/index.ts**:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    off: (channel, listener) => ipcRenderer.off(channel, listener),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
})
```

### 6. Type Definitions

**global.d.ts**:
```typescript
interface Window {
  electron?: {
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      off: (channel: string, listener: (...args: any[]) => void) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}
```

### 7. Supabase Dashboard Configuration

1. Visit: https://supabase.com/dashboard
2. Select project → **Authentication** → **URL Configuration**
3. Add Redirect URL: `myapp://auth/callback`
4. Save

---

## 🔑 Key Points

### ✅ Must Do

1. **Use `skipBrowserRedirect: true`** - Prevent Supabase from auto-redirecting
2. **Extract tokens from hash** - Supabase uses `#access_token=...` format
3. **Open in system browser** - Use `shell.openExternal`, not in Electron window
4. **IPC communication** - Pass tokens between main and renderer process via IPC
5. **Single instance lock** - Windows/Linux requires `requestSingleInstanceLock()`

### ❌ Common Mistakes to Avoid

1. ~~Don't open OAuth in Electron window~~ - Google will block it
2. ~~Don't use shell.openExternal directly in preload~~ - `this` binding issues
3. ~~Don't forget `event.preventDefault()`~~ - macOS open-url event
4. ~~Don't extract tokens from query params~~ - Supabase uses hash

---

## 🧪 Testing

### Development Environment
```bash
npm run dev
# Click login → Browser opens → Select account → Auto return to app
```

### Production Environment
```bash
# Build (skip code signing)
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build

# Install and test
```

### Manual Deep Link Testing
```bash
# macOS
open "myapp://auth/callback?test=1"

# Should see app focus and log output
```

---

## 📊 Complete Flow

```
User clicks login
  ↓
Renderer process: signInWithGoogle()
  ↓
Supabase: Returns OAuth URL
  ↓
Renderer process: IPC call oauth:openBrowser
  ↓
Main process: shell.openExternal(url)
  ↓
System browser: Opens Google login
  ↓
User selects account and authorizes
  ↓
Browser: Redirects to myapp://auth/callback#access_token=...
  ↓
Main process: open-url event triggers
  ↓
Main process: Extract tokens
  ↓
Main process: IPC send oauth-success
  ↓
Renderer process: createSessionFromOAuthTokens()
  ↓
Login success ✅
```

---

## 🐛 Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| Browser opens but doesn't return | Is deep link registered? | Restart app or reinstall |
| Session not created | Check IPC listener | Confirm `oauth-success` is registered |
| Token extraction fails | Check hash extraction | Use `urlObj.hash.match()` |
| Dev environment not working | Protocol registration params | Use `process.execPath` |

---

## 📝 Minimal Example

**main.ts**:
```typescript
app.setAsDefaultProtocolClient('myapp')

app.whenReady().then(() => {
  ipcMain.handle('oauth:openBrowser', async (_, url) => {
    await shell.openExternal(url)
  })
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  const accessToken = url.match(/access_token=([^&]*)/)?.[1]
  const refreshToken = url.match(/refresh_token=([^&]*)/)?.[1]
  if (accessToken && refreshToken) {
    mainWindow.webContents.send('oauth-success', { accessToken, refreshToken })
  }
})
```

**renderer.tsx**:
```typescript
// Initiate login
const { data } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: 'myapp://auth/callback', skipBrowserRedirect: true },
})
await window.electron.ipcRenderer.invoke('oauth:openBrowser', data.url)

// Listen for callback
window.electron.ipcRenderer.on('oauth-success', async (_, { accessToken, refreshToken }) => {
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
})
```

---

**Created**: 2025-10-28
**Test Environment**: macOS, Electron 33.2.1, Supabase 2.x
**Status**: ✅ Production Ready
