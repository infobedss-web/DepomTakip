# BEDSS Commercial V1 - Stabilizasyon TODO

## Bu pakette tamamlananlar
- [x] Offline işlem kuyruğuna `business_id`, `user_id`, `device_id` kapsamı eklendi.
- [x] Senkronizasyon yalnızca aktif kullanıcı/firma kapsamındaki işlemleri gönderir.
- [x] Yarım kalmış `SYNCING` işlemleri tekrar `PENDING` durumuna alınır.
- [x] Çıkışta seçili firma bilgisi temizlenir.
- [x] Çift service-worker yaklaşımı kaldırıldı; `vite-plugin-pwa/Workbox` tek kaynak yapıldı.
- [x] Android/iOS için PNG PWA ikonları ve Apple touch icon eklendi.

## Production öncesi zorunlu doğrulamalar
- [ ] Temiz makinede `npm ci` ve `npm run build` doğrulaması.
- [ ] PostgreSQL migration + seed + backend testleri.
- [ ] İki farklı firma ve kullanıcı ile offline veri izolasyonu entegrasyon testi.
- [ ] Android Chrome gerçek cihaz PWA kurulum/kamera/barkod testi.
- [ ] iPhone Safari gerçek cihaz PWA kurulum/kamera/barkod testi.
- [ ] İnternet kes/aç, uygulamayı kapat/aç ve çakışma senaryoları.
- [ ] Production HTTPS, merkezi PostgreSQL, backup/restore, log/monitoring.
- [ ] 14 günlük trial ve Beginner/Plus/Pro paket kuralları.

> Not: Bu ZIP geliştirme/stabilizasyon paketidir. Yukarıdaki gerçek cihaz ve production testleri tamamlanmadan “tam production onaylı” kabul edilmemelidir.

## P0.2 - Stabilizasyon (17.09.2026)
- [x] Backend TypeScript ambient type taraması sınırlandı (`types: [node]`).
- [x] Web TypeScript ambient type taraması sınırlandı (`vite/client`, `react`, `react-dom`).
- [x] Idempotency kayıtlarına request body SHA-256 hash desteği eklendi (migration 029).
- [x] Aynı operation ID'nin farklı payload ile yeniden kullanılmasına 409 koruması eklendi.
- [x] 5 dakikadan eski yarım kalmış PROCESSING idempotency kayıtları recovery akışına alındı.
- [ ] Temiz `npm ci` bu çalışma ortamında ağ/zaman aşımı nedeniyle tamamlanamadı; Windows/CI üzerinde doğrulanmalı.
- [ ] `npm run build` temiz dependency kurulumu sonrasında doğrulanmalı.
- [ ] PostgreSQL migration 029 gerçek DB üzerinde uygulanıp test edilmeli.
- [ ] Backend test suite gerçek PostgreSQL ile çalıştırılmalı.
- [ ] Android Chrome ve iPhone Safari gerçek cihaz PWA testleri yapılmalı.

## RC3 Commercial licensing
- [x] 14-day TRIAL default for newly created firms (migration 030)
- [x] BEGINNER / PLUS / PRO plan codes
- [x] Android/iPhone PWA install guide
- [ ] Enforce plan feature matrix at API permission boundaries
- [ ] Production payment/renewal workflow
