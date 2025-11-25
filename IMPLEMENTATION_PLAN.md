# Access Code System Implementation Plan

## Overview

Replace the current basic HTTP authentication with a wallet-based access code system. Users will connect their wallet, enter an access code, and complete a captcha to gain access. Registered wallets can bypass future access code entry.

---

## Architecture

### Data Storage: Vercel KV

Using Vercel KV (Redis-based) for simple key-value storage:

```
access_codes:{code}     -> { maxUses: number | null, currentUses: number, createdAt: string, createdBy: string }
wallets:{address}       -> { accessCode: string, registeredAt: string }
code_wallets:{code}     -> [address1, address2, ...]  // For analytics
```

### Tech Stack
- **Storage**: Vercel KV (`@vercel/kv`)
- **Captcha**: hCaptcha (privacy-focused, free tier)
- **Wallet**: Existing wagmi/svelte-wagmi setup
- **Admin Auth**: Existing BASIC_AUTH credentials

---

## Database Schema

### Access Codes
```typescript
interface AccessCode {
  code: string;           // Unique code (e.g., "STOXX-ALPHA-2024")
  maxUses: number | null; // null = unlimited
  currentUses: number;    // Track usage count
  createdAt: string;      // ISO timestamp
  createdBy: string;      // Admin identifier
  label?: string;         // Optional description (e.g., "Twitter Campaign")
}
```

### Registered Wallets
```typescript
interface RegisteredWallet {
  address: string;        // Wallet address (checksummed)
  accessCode: string;     // Code used to register
  registeredAt: string;   // ISO timestamp
}
```

---

## File Structure Changes

```
src/
├── lib/
│   ├── server/
│   │   ├── auth.ts              # MODIFY: Keep for admin auth
│   │   ├── accessCodes.ts       # NEW: Access code logic
│   │   └── kv.ts                # NEW: Vercel KV client wrapper
│   ├── stores/
│   │   └── accessStore.ts       # NEW: Access state management
│   └── components/
│       └── AccessGate.svelte    # NEW: Access code entry component
│
├── routes/
│   ├── access/                  # NEW: Access code entry page
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   │
│   ├── admin/                   # NEW: Admin sub-site
│   │   ├── +layout.svelte
│   │   ├── +layout.server.ts    # Basic auth protection
│   │   ├── +page.svelte         # Dashboard
│   │   └── codes/
│   │       ├── +page.svelte     # List/generate codes
│   │       └── +page.server.ts
│   │
│   ├── api/
│   │   ├── access/
│   │   │   ├── check/+server.ts   # NEW: Check if wallet registered
│   │   │   ├── register/+server.ts # NEW: Register wallet with code
│   │   │   └── validate/+server.ts # NEW: Validate access code
│   │   └── admin/
│   │       └── codes/+server.ts    # NEW: CRUD for access codes
│   │
│   ├── login/                   # REMOVE: No longer needed
│   │
│   └── (main)/                  # MODIFY: Update protection logic
│       └── +layout.svelte
│
└── hooks.server.ts              # MODIFY: Update auth logic
```

---

## Implementation Steps

### Phase 1: Setup Vercel KV & Infrastructure

#### 1.1 Install Dependencies
```bash
npm install @vercel/kv hcaptcha
```

#### 1.2 Create KV Client (`src/lib/server/kv.ts`)
```typescript
import { createClient } from '@vercel/kv';
import { KV_REST_API_URL, KV_REST_API_TOKEN } from '$env/static/private';

export const kv = createClient({
  url: KV_REST_API_URL,
  token: KV_REST_API_TOKEN,
});
```

#### 1.3 Create Access Code Service (`src/lib/server/accessCodes.ts`)
Functions:
- `createAccessCode(code, maxUses, label, createdBy)`
- `validateAccessCode(code)` - Check if code exists and has uses remaining
- `useAccessCode(code)` - Increment usage count
- `getAccessCode(code)` - Get code details
- `listAccessCodes()` - List all codes (admin)
- `deleteAccessCode(code)` - Delete code (admin)
- `registerWallet(address, code)` - Register wallet with code
- `isWalletRegistered(address)` - Check if wallet is registered
- `getWalletInfo(address)` - Get wallet registration details
- `getWalletsByCode(code)` - Get all wallets for a code (analytics)

#### 1.4 Environment Variables (Vercel Dashboard)
```
KV_REST_API_URL=<from Vercel KV setup>
KV_REST_API_TOKEN=<from Vercel KV setup>
PUBLIC_HCAPTCHA_SITEKEY=<hCaptcha site key>
HCAPTCHA_SECRET=<hCaptcha secret key>
```

---

### Phase 2: API Endpoints

#### 2.1 Check Wallet Registration (`src/routes/api/access/check/+server.ts`)
```typescript
// GET /api/access/check?address=0x...
// Returns: { registered: boolean, registeredAt?: string }
```

#### 2.2 Validate Access Code (`src/routes/api/access/validate/+server.ts`)
```typescript
// POST /api/access/validate
// Body: { code: string }
// Returns: { valid: boolean, remaining?: number }
```

#### 2.3 Register Wallet (`src/routes/api/access/register/+server.ts`)
```typescript
// POST /api/access/register
// Body: { address: string, code: string, captchaToken: string }
// Returns: { success: boolean, error?: string }

// Steps:
// 1. Verify hCaptcha token
// 2. Validate access code
// 3. Check wallet not already registered
// 4. Register wallet
// 5. Increment code usage
```

#### 2.4 Admin Codes API (`src/routes/api/admin/codes/+server.ts`)
```typescript
// Protected by Basic Auth header check

// GET - List all codes
// POST - Create new code { code, maxUses?, label? }
// DELETE - Delete code { code }
```

---

### Phase 3: Access Gate UI

#### 3.1 Access Store (`src/lib/stores/accessStore.ts`)
```typescript
import { writable, derived } from 'svelte/store';
import { signerAddress } from 'svelte-wagmi';

export const walletRegistered = writable<boolean | null>(null); // null = loading
export const checkingAccess = writable<boolean>(false);

// Check registration status when wallet connects
export async function checkWalletAccess(address: string): Promise<boolean> {
  checkingAccess.set(true);
  try {
    const res = await fetch(`/api/access/check?address=${address}`);
    const data = await res.json();
    walletRegistered.set(data.registered);
    return data.registered;
  } finally {
    checkingAccess.set(false);
  }
}
```

#### 3.2 Access Page (`src/routes/access/+page.svelte`)
UI Flow:
1. **Step 1**: Connect Wallet button (if not connected)
2. **Step 2**: Access Code input field (shown after wallet connected)
3. **Step 3**: hCaptcha widget
4. **Submit**: Register button (enabled when all complete)

States:
- Loading (checking if wallet already registered)
- Already registered → redirect to main app
- Need registration → show form
- Submitting → loading state
- Success → redirect to main app
- Error → show error message

#### 3.3 Update Hooks (`src/hooks.server.ts`)
```typescript
// Remove basic auth session checking
// Add allowlist for /access route
// Admin routes still use basic auth

const publicPaths = [
  '/access',
  '/api/access',
  '/_app',
  '/images',
  // ... other static paths
];

const adminPaths = ['/admin'];

export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;

  // Public paths - no auth needed
  if (publicPaths.some(p => path.startsWith(p))) {
    return resolve(event);
  }

  // Admin paths - basic auth required
  if (adminPaths.some(p => path.startsWith(p))) {
    return handleBasicAuth(event, resolve);
  }

  // All other paths - handled by client-side wallet check
  return resolve(event);
};
```

---

### Phase 4: Client-Side Access Gating

#### 4.1 Update Main Layout (`src/routes/(main)/+layout.svelte`)
```typescript
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { signerAddress, connected } from 'svelte-wagmi';
import { walletRegistered, checkWalletAccess } from '$lib/stores/accessStore';

// Watch for wallet connection
$: if ($signerAddress && $connected) {
  checkWalletAccess($signerAddress).then(registered => {
    if (!registered) {
      goto('/access');
    }
  });
}

// If wallet disconnects, redirect to access page
$: if (!$connected && browser) {
  goto('/access');
}
```

#### 4.2 Access Page Logic (`src/routes/access/+page.svelte`)
```svelte
<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { signerAddress, connected, web3Modal } from 'svelte-wagmi';
  import { walletRegistered, checkWalletAccess } from '$lib/stores/accessStore';
  import HCaptcha from 'svelte-hcaptcha'; // or vanilla hcaptcha

  let accessCode = '';
  let captchaToken = '';
  let submitting = false;
  let error = '';

  // Check if already registered when wallet connects
  $: if ($signerAddress) {
    checkWalletAccess($signerAddress).then(registered => {
      if (registered) goto('/');
    });
  }

  async function handleSubmit() {
    submitting = true;
    error = '';

    try {
      const res = await fetch('/api/access/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: $signerAddress,
          code: accessCode,
          captchaToken
        })
      });

      const data = await res.json();

      if (data.success) {
        walletRegistered.set(true);
        goto('/');
      } else {
        error = data.error || 'Registration failed';
      }
    } catch (e) {
      error = 'Network error. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>
```

---

### Phase 5: Admin Sub-site

#### 5.1 Admin Layout with Basic Auth (`src/routes/admin/+layout.server.ts`)
```typescript
import { redirect } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

export const load = async ({ cookies }) => {
  if (!validateSession(cookies)) {
    throw redirect(303, '/admin/login');
  }
  return {};
};
```

#### 5.2 Admin Login Page (`src/routes/admin/login/+page.svelte`)
- Reuse existing login form UI
- Redirects to /admin on success

#### 5.3 Admin Dashboard (`src/routes/admin/+page.svelte`)
- Overview stats (total codes, total registrations)
- Quick links to manage codes

#### 5.4 Code Management (`src/routes/admin/codes/+page.svelte`)
Features:
- List all access codes with stats
- Create new code form:
  - Code (auto-generate or custom)
  - Max uses (optional)
  - Label (optional)
- Delete code button
- View wallets registered with each code
- Export data as CSV

---

### Phase 6: Cleanup

#### 6.1 Remove Old Login
- Delete `src/routes/login/` directory
- Update any redirects pointing to `/login`

#### 6.2 Update Navigation
- Remove login/logout buttons from header
- Add wallet connection status
- Add admin link (if authenticated)

#### 6.3 Update Environment Variables
- Add new KV and hCaptcha variables to Vercel
- Document in README

---

## Security Considerations

1. **Rate Limiting**: Add rate limiting to `/api/access/register` to prevent brute-force
2. **Code Format**: Use sufficiently random codes (e.g., `STOXX-XXXX-XXXX`)
3. **Captcha**: hCaptcha prevents automated abuse
4. **Address Validation**: Validate and checksum all wallet addresses
5. **Admin Protection**: Basic auth + consider IP allowlisting for admin routes
6. **CORS**: Ensure API endpoints have proper CORS headers

---

## Testing Plan

1. **Unit Tests**
   - Access code creation/validation
   - Wallet registration logic
   - KV operations

2. **Integration Tests**
   - Full registration flow
   - Admin code management
   - Edge cases (expired codes, duplicate registration)

3. **E2E Tests**
   - User journey: connect wallet → enter code → captcha → access
   - Admin journey: login → create code → view analytics

---

## Migration Plan

1. **Deploy KV**: Set up Vercel KV storage
2. **Deploy Code**: Deploy with access system (behind feature flag initially)
3. **Generate Initial Codes**: Create access codes for existing users
4. **Communicate**: Notify users of new access method
5. **Enable**: Remove feature flag, go live
6. **Monitor**: Watch for issues, monitor registration rates

---

## Environment Variables Summary

```bash
# Existing
BASIC_AUTH_USER=          # Keep for admin auth
BASIC_AUTH_PASS=          # Keep for admin auth
SESSION_SECRET=           # Keep for admin sessions

# New - Vercel KV
KV_REST_API_URL=          # From Vercel KV dashboard
KV_REST_API_TOKEN=        # From Vercel KV dashboard

# New - hCaptcha
PUBLIC_HCAPTCHA_SITEKEY=  # Public site key
HCAPTCHA_SECRET=          # Private verification key
```

---

## Timeline Estimate

| Phase | Tasks |
|-------|-------|
| Phase 1 | Setup KV, dependencies, base services |
| Phase 2 | API endpoints |
| Phase 3 | Access gate UI |
| Phase 4 | Client-side gating in main app |
| Phase 5 | Admin sub-site |
| Phase 6 | Cleanup, testing, deployment |

---

## Open Questions

1. **Code Format**: What format for access codes? Suggestions:
   - `STOXX-XXXX-XXXX` (branded, 8 random chars)
   - UUID-based
   - Custom admin-defined

2. **Expiration**: Should codes have expiration dates?

3. **Wallet Signature**: Should we require a wallet signature during registration for additional verification?

4. **Multiple Wallets**: Can one access code be used by multiple wallets (up to maxUses)?

5. **Revocation**: Should we support revoking access for a registered wallet?
