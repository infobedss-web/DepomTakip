# DepomTakip V2.5 — Production Doğrulama ve Tek Komut Kurulum

Bu sürüm V2.4'ün özelliklerini korur ve gerçek Windows/PostgreSQL testine geçişi kolaylaştırır.

## Yapılanlar

- Proje sürümü `2.5.0` oldu.
- Workspace adları `@depomtakip/api` ve `@depomtakip/web` olarak markalandı.
- Yerel PostgreSQL varsayılanı `depomtakip` / `depomtakip_test` veritabanlarına geçirildi.
- Demo kullanıcı alan adı `@depomtakip.local` oldu.
- Demo parola `DepomTakip!2026`, demo sayım oda kodu `DT-DEMO` oldu.
- `/api/health` için `application=DepomTakip`, `database=PostgreSQL` preflight doğrulaması eklendi.
- Tüm SQL migration dosyaları UTF-8 BOM açısından otomatik kontrol ediliyor.
- `START_DEPOMTAKIP.bat`: PostgreSQL'i hazırlar, bağımlılıkları kurar, migration+seed yapar ve sistemi açar.
- `TEST_DEPOMTAKIP.bat`: preflight, DB, temiz npm kurulum, build, migration, seed, backend testleri, API health ve rol smoke testlerini tek akışta çalıştırır.
- `STOP_DEPOMTAKIP_DB.bat`: yalnızca bu proje için oluşturulan yerel PostgreSQL kümesini durdurur.
- Eski `bedss_device_id` cihaz anahtarı geriye uyumluluk için korunur; yeni cihazlar `depomtakip_device_id` kullanır.

## Windows'ta ilk test

1. ZIP'i kısa bir klasöre çıkarın, örn. `C:\DepomTakip-V2.5`.
2. PostgreSQL 17 ve Node.js 22+ kurulu olsun.
3. Önce `TEST_DEPOMTAKIP.bat` çalıştırın.
4. Tüm testler geçerse `START_DEPOMTAKIP.bat` ile sistemi açın.
5. Telefonda aynı ağdan PWA'yı test edin; production/Vercel aşamasında HTTPS kamera erişimi kullanılacaktır.

## Demo girişleri

- Merkez: `admin@depomtakip.local`
- Bayi Yetkilisi: `bayi@depomtakip.local`
- Sayım Görevlisi: `sayim@depomtakip.local`
- Ortak demo parola: `DepomTakip!2026`

Personel için ayrı bayi lisansı gerekmez; kullanıcı bağlı olduğu bayinin aktif lisansı üzerinden çalışır.
