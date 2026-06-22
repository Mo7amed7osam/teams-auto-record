# Licensing Architecture

The Teams Auto Record extension uses a secure, server-side licensing system to bind a single activation code to a single installation (device).

## Architecture Overview

The system consists of three parts:

1.  **Extension Client**: Runs in the user's browser. It generates a unique Installation ID, captures the activation code via the popup UI, and calls the backend for activation and verification.
2.  **Node.js Backend**: An Express server (optimized for Render) that validates requests, enforces rate limits, handles business logic (activation, verification), and interacts with the database.
3.  **MongoDB Atlas**: The database that stores the authoritative state of all licenses and operation logs.

## Security Guarantees and Limitations

### Server-Side Enforcement

All critical licensing decisions happen on the backend. The extension never makes authorization decisions independently.

*   Before performing any `Start` operation (e.g., actually automating Teams settings), the extension **must** successfully verify the license with the backend.
*   The backend validates the license status, expiration, allowed extension versions, and ensures the requesting installation ID matches the one bound to the license.

### Device Binding

The system uses a "first-come, first-served" device binding approach.

1.  An activation code is initially "unbound".
2.  The first installation to use the code binds its unique Installation ID to that license in the database.
3.  Subsequent attempts to activate or verify with the same code but a different Installation ID are rejected.

### Hashes, Not Plaintext

To protect against data breaches, the backend never stores plaintext activation codes or installation IDs.

*   `LICENSE_HASH_SECRET` and `DEVICE_HASH_SECRET` (configured via environment variables) are used to perform HMAC-SHA-256 hashes of the values before they are stored in MongoDB or used in queries.

### Extension Limitations (Documented Honestly)

It is crucial to understand that code running on a user's machine can be inspected and modified.

*   **No Secrets in Client**: The extension code contains *no* database credentials, hash secrets, or API keys.
*   **Obfuscation is not perfect**: While the production build is obfuscated, a determined attacker could theoretically modify the extension code to bypass the client-side check.
*   **Local Storage is not secure**: The extension caches the license token and status in `chrome.storage.local` for UX purposes (e.g., to avoid a network call when just opening the popup). This is *not* a security boundary.
*   **True enforcement is on the server**: If an attacker modifies the extension, they can bypass the client UI checks, but they cannot perform the automation without the server's approval (assuming the server is tracking run counts or other server-side limits, which this system supports).

## Activation Flow

1.  The user opens the extension popup for the first time. The popup detects no active license and shows the Activation Panel.
2.  The user enters their activation code (e.g., `TAR-1234-5678-ABCD`).
3.  The extension normalizes the code and calls `POST /api/licenses/activate`, sending the code and its generated Installation ID.
4.  The backend:
    *   Hashes the code and Installation ID.
    *   Uses an atomic `findOneAndUpdate` operation to find an active, unbound (or already bound to this ID) license and binds it.
    *   Generates a short-lived JWT token.
5.  The backend responds with success and the token.
6.  The extension saves the status and token locally and shows the main UI.

## Verification Flow

Before any `Start` operation:

1.  The extension calls `POST /api/licenses/verify`, sending the code, Installation ID, operation type, and a unique `operationId`.
2.  The backend:
    *   Verifies the JWT token (if provided, though the current implementation requires full validation on every start).
    *   Checks the database to ensure the license is still active, not expired, and bound to the correct Installation ID.
    *   For `Start` operations, it ensures the `operationId` hasn't been processed recently (idempotency) and increments the run count if applicable.
3.  If successful, the backend returns a new token and allows the operation.
4.  If the verification fails, the extension blocks the automation and displays an error message.

## Atomic Activation

To prevent race conditions where two installations try to activate the same code simultaneously, the backend uses an atomic MongoDB update:

```javascript
// Simplified representation of the atomic update
License.findOneAndUpdate(
  {
    licenseKeyHash,
    status: 'active',
    $or: [{ boundDeviceIdHash: null }, { boundDeviceIdHash: incomingDeviceHash }]
  },
  [ // Update pipeline
    {
      $set: {
        boundDeviceIdHash: incomingDeviceHash,
        activatedAt: { $cond: [{ $eq: ['$boundDeviceIdHash', null] }, new Date(), '$activatedAt'] }
      }
    }
  ]
)
```

## Error Codes

The backend returns standardized error codes which the client maps to user-friendly messages:

*   `INVALID_REQUEST`
*   `LICENSE_NOT_FOUND`
*   `LICENSE_DISABLED`
*   `LICENSE_EXPIRED`
*   `LICENSE_ALREADY_BOUND`
*   `DEVICE_MISMATCH`
*   `VERSION_NOT_ALLOWED`
*   `RUN_LIMIT_REACHED`
*   `RATE_LIMITED`
*   `SERVER_UNAVAILABLE`
*   `INVALID_TOKEN`

## Offline Behavior

The system includes an `OFFLINE_GRACE_HOURS` configuration (default 12 hours). For non-critical operations (like opening the popup or running a preview), the extension will allow access if it has successfully verified with the server within the grace period.

**However, `Start` operations always require a successful, real-time connection to the backend verification endpoint.**
