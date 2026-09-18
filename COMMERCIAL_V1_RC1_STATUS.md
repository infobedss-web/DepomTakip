# BEDSS Commercial V1 RC1 - Durum

Tarih: 17.09.2026

## RC1'e alınan P0 düzeltmeleri
- Offline queue firma (`business_id`), kullanıcı (`user_id`) ve cihaz (`device_id`) kapsamına alındı.
- Aktif oturum dışındaki offline işlemlerin senkronizasyona karışması engellendi.
- Yarım kalan `SYNCING` kayıtları için recovery eklendi.
- Logout/firma oturumu temizliği güçlendirildi.
- PWA service-worker yapısı `vite-plugin-pwa/Workbox` altında tekleştirildi.
- Android/iOS PWA ikonları ve Apple touch icon eklendi.
- Idempotency request SHA-256 hash kontrolü eklendi.
- Aynı operation ID'nin farklı payload ile tekrar kullanımına 409 koruması eklendi.
- Eski `PROCESSING` idempotency kayıtları için recovery eklendi.
- `029_idempotency_request_hash.sql` migration'ı eklendi.

## RC1 doğrulama durumu
- `npm run build`: BU ORTAMDA DOĞRULANAMADI. Mevcut node_modules eksik; `@types/node` bulunamadı.
- `npm ci`: çalışma ortamında ağ/zaman aşımı nedeniyle tamamlanamadı.
- PostgreSQL migration/seed: gerçek PostgreSQL bağlantısı olmadan doğrulanmadı.
- Android/iPhone gerçek cihaz: doğrulanmadı.

Bu nedenle bu paket bir **Release Candidate (RC1)**'dir; production-final değildir.

## Final öncesi geçiş kapıları
1. Temiz Windows/CI: `npm ci` -> `npm run build`.
2. PostgreSQL: migrate -> seed -> backend test suite.
3. İki firma/iki kullanıcı offline izolasyon testi.
4. İnternet kes/aç + uygulama kapat/aç + retry/idempotency testi.
5. Android Chrome PWA kamera/barkod/kurulum testi.
6. iPhone Safari PWA kamera/barkod/kurulum testi.
7. HTTPS + merkezi PostgreSQL + backup/restore + monitoring.
8. Trial ve paket kuralları.

## RC2 eklemesi
- `scripts/verify-commercial.ps1`: Windows'ta temiz kurulum -> build -> migration -> seed -> test zincirini tek komutla doğrular.
- `RC2_WINDOWS_TEST.md`: gerçek cihaz/offline geçiş kapılarını tanımlar.
