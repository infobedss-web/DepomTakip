# BEDSS Commercial V1 RC4 - Finalization Status

## Applied in this package

- Second blind count opening conflict fixed: completed first-round rooms no longer block round 2; other OPEN rooms still protect the same stock from concurrent counting.
- Room code normalization remains case/whitespace tolerant.
- Mobile assigned-location tap flow restored (`location_code` activation) while QR/manual entry remains available.
- Count submission now sends the base demo/test unit `Adet`, matching `product_units` validation.
- Active TypeScript sources cleaned of the observed Turkish mojibake strings.
- Temporary ORIGIN and stock-adjustment debug logs removed.
- Compile-visible backup TypeScript files removed from `src`.
- Seed contains valid EAN-13 demo barcodes and warehouse assignments for demo count staff.
- Vercel-safe document/photo persistence added with migration `031_document_content.sql`; uploads no longer depend on a persistent local filesystem.
- Production deployment notes and environment example updated.

## Verification performed in this workspace

After the RC4 counting/encoding fixes, backend TypeScript compilation completed and web TypeScript build stage completed. The Vite bundle step could not be rerun to completion in this Linux sandbox because the uploaded archive contained Windows-native `node_modules`; those dependencies were removed from this final package. Run `npm ci` followed by `npm run build` on a clean machine/CI/Vercel before deployment.

## Production gate

Before production traffic: configure managed PostgreSQL `DATABASE_URL`, run migrations through 031 once, build, verify `/api/health`, then perform phone PWA camera + QR/EAN + online/offline + first/second blind count tests.
