# BEDSS Commercial V1 - RC3

## Added in RC3
- Commercial license naming: TRIAL / BEGINNER / PLUS / PRO.
- New firms receive a 14-day TRIAL automatically after migration 030.
- Trial defaults: 1 warehouse, 10 users, offline + blind count + mobile PWA features.
- Existing PILOT licenses migrate to TRIAL; STARTER migrates to BEGINNER.
- Old backup copies under `web/src` were removed from the release candidate.

## Client installation rule
Customer PCs/phones do **not** install Node.js or PostgreSQL. Those are server/build dependencies only.
- Firm authority: HTTPS web panel.
- Android/iPhone staff: installable PWA from HTTPS URL.
- Offline work: local browser storage + sync queue.

## Still required before FINAL
- Clean `npm ci` and production build on a networked build machine.
- PostgreSQL migrations 001-030 + seed verification.
- Backend automated tests.
- Android Chrome and iPhone Safari PWA install/camera/offline/reconnect tests.
- Production HTTPS/API/PostgreSQL/backup configuration.

Do not label RC3 as FINAL until these checks pass.
