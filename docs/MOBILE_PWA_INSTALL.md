# BEDSS Mobile PWA Installation

## Android
1. Open the production BEDSS HTTPS address in Chrome.
2. Sign in or open the company invitation/QR link.
3. Choose **Add to Home screen / Install app**.
4. Allow camera access when barcode/QR scanning is first used.

## iPhone / iPad
1. Open the production BEDSS HTTPS address in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Open BEDSS from the new home-screen icon.
5. Allow camera access when requested.

## Offline acceptance test
1. Sign in while online and open the assigned count room.
2. Confirm the required snapshot is available locally.
3. Disable Wi-Fi and mobile data.
4. Scan a product and save a blind-count operation.
5. Re-enable connectivity.
6. Reopen/foreground BEDSS and wait for sync.
7. Verify the server contains exactly one operation and the local queue is completed.

Node.js, npm and PostgreSQL are never installed on employee phones.
