

# Fix: Login Failing Due to Stale Tunnel URL

## Problem
The app stores two separate server URLs in localStorage:
- `arena_api_base` (Cloudflare tunnel URL set manually by user)
- `arena_discovered_server` (auto-discovered server)

The health check succeeds on the **new** tunnel (`annie-divisions-...`), but login calls go to the **old** tunnel (`making-preventing-...`) because `useAuth` reads the stale `arena_api_base` value first.

## Root Cause
In `getApiBase()`, the Cloudflare URL (`arena_api_base`) takes priority as fallback, but after auto-discovery succeeds, the discovered server should take precedence. The issue is a race condition: `useAuth` calls `getApiBase()` before auto-discovery completes in `App.tsx`.

## Solution

### 1. Update `useAuth.ts` to wait for server discovery
- Add a check that ensures the API base is resolved before making auth calls
- Use `getDiscoveredServer()` result when available, falling back to `getApiBase()`

### 2. Sync tunnel URL on successful health check
- In `Landing.tsx` server connection logic, when a new tunnel is validated, update `arena_api_base` to match so both keys stay in sync

### 3. Add a "Reconectar" (Reconnect) button on the login error
- When login fails with "Failed to fetch", show a clear message: "Servidor inacessivel. Verifique o tunel ou atualize a URL."
- Include a button to open the server config section

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAuth.ts` | Use `getDiscoveredServer()` with priority over stale `getApiBase()` in `signIn`/`signUp` calls |
| `src/pages/Landing.tsx` | Update `arena_api_base` when a new tunnel is validated; show better error message on "Failed to fetch" |
| `src/lib/apiMode.ts` | In `autoDiscoverServer`, also update `arena_api_base` when Cloudflare tunnel is validated to keep keys in sync |

## Technical Details

In `apiMode.ts`, inside the Cloudflare tunnel validation block (line ~134), add:
```typescript
// Sync the manual key with discovered server
localStorage.setItem(CLOUDFLARE_STORAGE_KEY, cloudflare);
```

In `useAuth.ts`, replace direct `buildApiUrl(getApiBase(), ...)` calls with a helper that prefers the discovered server:
```typescript
const getAuthBase = () => getDiscoveredServer() || getApiBase();
```

In `Landing.tsx`, improve the error handling in `handleLogin` to detect "Failed to fetch" and show a specific message guiding the user to update their tunnel URL.

