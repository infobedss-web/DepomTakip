# BEDSS Stabilizasyon Checkpoint

6 Eylül 2026. Yeni ürün özelliği veya bağımlılık eklenmeden mevcut sürüm doğrulandı.

| Kontrol | Sonuç |
| --- | --- |
| Frontend TypeScript + Vite build | PASS |
| Backend TypeScript build | PASS |
| PostgreSQL entegrasyon testleri | PASS — 9/9 |
| Playwright Edge | PASS — 3/3; count-flow dahil, toplam 13,5 saniye |
| Kod biçimi kontrolü | PASS |
| PostgreSQL sağlık kontrolü | PASS; `/api/health` → `ok` |
| Migration | PASS; sürümler 1, 2, 3 uygulanmış |
| Seed tekrar çalıştırma | PASS; mevcut demo verileri korunuyor |
| Demo hesapları | PASS — 7/7 giriş, beklenen rol, oturum doğrulaması, çıkış |
| İşletme ve rol sınırları | PASS — yetkisiz işlemler 403 |
| Kör sayım | PASS — Counter/Auditor yönetim uçları engelli, oda/ilerleme yanıtlarında sistem miktarı yok, tarama yanıtı kör |
| Eşzamanlı sayım | PASS — aynı ürün/lokasyon ve aynı reyonun alt hücreleri arasında ikinci kullanıcı engelleniyor |
| Audit Log | PASS — testlerde işlem/önce-sonra kayıtları doğrulandı; ana demo DB'de kayıtlar mevcut |
| Kalan FAIL | Yok |

Count-flow hatası birim select alanının test seçicisindeydi. Test `select[name="unit"]` üzerinden Koli seçiyor. Başarısız test temizliğinin ilk hatayı maskelemesi de düzeltildi; temizlik yalnızca test DB'sindeki o çalıştırmaya ait oda kimliğiyle sınırlı.

Temel zincir gerçek REST/PostgreSQL testlerinde bayi → depo → lokasyon → ürün/stok → oda → atama/onay → kör sayım → fark/düzeltme/onay şeklinde geçti. Tarayıcı testi oda katılımı, bayi onayı, reyon tarama, ürün kilidi, `2 Koli = 24 Adet`, bitirme ve rapor sonucunu doğruladı.

Çalışan URL: **http://127.0.0.1:4000**. PostgreSQL: `127.0.0.1:55432`, ana DB `bedss`, test DB `bedss_test`.

Demo hesapları: `admin@bedss.local`, `bayi@bedss.local`, `sayim@bedss.local`, `sayim2@bedss.local`, `bilirkisi@bedss.local`, `misafir@bedss.local`, `ege@bedss.local`. Ortak şifre: `BedssDemo!2026`.

Tamamlanan modüller: authentication, roller/granüler izinler, dashboard, bayi/depo/lokasyon oluşturma-listeleme, ürün/stok ve birimler, oda/QR/atama/onay, kör sayım ve kilit, fotoğraf/not, temel fark raporu ve onay/ret/düzeltme, audit ve demo verileri.

Eksikler: gerçek e-posta teslimi; genel kart düzenleme/arşivleme; mal kabul/yerleştirme/transfer/sevkiyat; gelişmiş fire/karantina; aynı stokta karışık durum miktarları; döngüsel sayım otomasyonu; gelişmiş raporlama/dışa aktarım; üretim dağıtımı ve gerçek telefon kamerası doğrulaması. Detay: [DELIVERY.md](DELIVERY.md).

Tekrar açma (bağımlılıklar kurulu):

```powershell
cd C:\BEDSS
powershell -ExecutionPolicy Bypass -File .\scripts\start-db.ps1
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

Kod değiştiyse `npm.cmd start` öncesi `npm.cmd run build`. Bağımlılıklar silindiyse önce `npm.cmd ci`.

Testleri tekrar çalıştırma:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
node scripts/verify-demo.mjs
```

Son demo doğrulama komutu için ana uygulama 4000 portunda çalışmalıdır. Kamera donanımı ve yüksek yük bu checkpoint kapsamında test edilmedi.
