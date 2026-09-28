# DepomTakip V2.6 — Production Hardening

V2.5 özellikleri korunmuştur. Bu sürüm production güvenliği ve operasyonel kurtarma adımlarına odaklanır.

## Eklenenler
- Proje sürümü `2.6.0`.
- Health yanıtına `version: 2.6.0` eklendi.
- `VERIFY_PRODUCTION.bat`: `DATABASE_URL`, `APP_ORIGIN`, HTTPS, `NODE_ENV` ve secret kontrolleri.
- `BACKUP_DEPOMTAKIP.bat`: PostgreSQL custom-format backup + SHA-256 checksum.
- `scripts/restore-db.ps1`: açık onay parametresi gerektiren kontrollü restore.
- `scripts/verify-v2.6.ps1`: V2.6 production dosyalarının statik doğrulaması.
- Production deployment dokümanına backup/restore ve environment kontrol akışı eklendi.

## Bilerek tamamlanmayanlar
- Gerçek Vercel/production deployment bu çalışma ortamından yapılmadı.
- Gerçek PostgreSQL backup/restore ancak hedef PostgreSQL bağlantısıyla doğrulanabilir.
- Android Chrome ve iPhone Safari gerçek cihaz testleri kullanıcı cihazlarında yapılmalıdır.
- Paket özellik matrisi ürün kararı gerektirdiği için varsayılarak uygulanmadı.
