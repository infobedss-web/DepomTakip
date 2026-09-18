# BEDSS toplu ürün aktarımı

## Kullanım

Ürün yönetme yetkisi gerekir. Sistem yetkilisi işletmeyi açıkça seçer; kayıt onayı işletme adını gösterir. İlk Excel satırı başlıklardır. Çalışma sayfası seçilebilir. Aynı başlıklar sütun numarasıyla ayrı tutulur. Bir standart alana iki sütun bağlanamaz.

Önce bütün partiler doğrulanıp PostgreSQL'e saklanır, sonra kaydedilir. Her parti tek transaction içinde ürünleri, Adet/Koli/Palet birimlerini ve audit kayıtlarını birlikte yazar. Hata halinde o parti tamamen geri alınır; önceki başarılı partiler korunur. Bu yapı bütün dosyayı tek transaction yapmaz.

Bağlantı kesildiğinde **Devam Et** sunucudan güncel durumu okur ve kaydedilmemiş partileri gönderir. Sayfa kapandıysa **Son Aktarımlar** listesinden devam edilebilir. Doğrulama henüz bitmediyse aynı dosya, sayfa ve eşleştirmeyle **Doğrula ve Kaydet** seçilmelidir. Veritabanıyla çakışan ürünleri içeren parti tekrar denemede de reddedilir; çakışma açıkça çözülmeden üzerine yazılmaz. Tamamlanan aktarım yeniden kaydedilemez.

## API sözleşmesi

`POST /api/products/bulk` aynı yetki ve tenant sınırlarını kullanır:

1. `START`: `business_id`, `file_hash` (dosya SHA-256), `mapping_hash` (eşleştirme/sayfa/sözleşme sürümü SHA-256), `filename`, `total_rows`, `total_batches`. İşletme + dosya + eşleştirme için kalıcı `job.id` döner; tekrar aynı kimliği döndürür.
2. `VALIDATE`: `job_id`, `batch_no` (1 tabanlı), `rows`. Her satır gerçek worksheet numarası olan `source_row` taşır. Aynı parti farklı içerikle değiştirilemez. Partiler arası SKU/barkod/Excel satırı tekrarları da denetlenir.
3. `COMMIT`: yalnız `job_id`, `batch_no`; istemciden yeni satır kabul etmez. Tekrarlı/eşzamanlı istekler job satır kilidiyle güvenlidir; COMMITTED parti yeniden yazılmaz. Farklı job'ların yarışları DB benzersiz indeksleriyle engellenir.

`GET /api/products/bulk/jobs` son 30 aktarımı; `GET /api/products/bulk/jobs/:id` kalıcı ilerlemeyi döndürür. Yanıtta `job` içinde `validated`, `inserted`, `remaining`, `failed`, `ready`, `batches` bulunur. Satır hataları `{row, field, type, message, first_row?}` biçimindedir. Doğrulama hatası 422, çakışma 409, fazla payload 413'tür. Eski bağımsız `{mode, business_id, rows}` istekleri yerine bu job protokolü kullanılmalıdır.

## Sınırlar ve veri doğruluğu

- Parti: en fazla 5.000 satır veya 6 MiB JSON; Express genel sınırı 8 MiB. Bölme UTF-8 byte sayısına göre yapılır.
- Dosya: 20 MiB; XLSX açılmış ZIP içeriği 80 MiB ve 2.048 girdi; en fazla 10 worksheet. Seçili worksheet 50.000 veri satırı (boş satırlar dahil), 64 sütun ve 2 milyon hücre ile sınırlıdır. Okuma worker içinde, 30 saniye zaman sınırıyla yapılır.
- SKU/barkod metindir. Sayısal Excel hücresinde 16+ hane, bilimsel metin veya formül reddedilir. Metin hücresindeki uzun kod ve baştaki sıfırlar korunur; Excel sıfır dolgu biçimi de okunur. Excel'de daha önce kaybolmuş rakamlar geri üretilemez; özgün metin kodu gerekir.
- Türkçe `1.234,56`, `1234,56`, İngilizce `1,234.56` desteklenir. `1.234`/`1,234` gibi belirsiz metinler açık biçim istenerek reddedilir. Fiyat/KDV 2, stok/birim 3 ondalık basamak; sessiz yuvarlama yapılmaz. Birim çarpanları pozitif olmalıdır.
- SKU/barkod kanonik anahtarı SQL ve TypeScript'te aynı ASCII/Türkçe harf çevirimini ve dış ASCII boşluk temizliğini kullanır. Aktarım kimlikleri Latin/Türkçe harf, rakam ve sınırlı ayraçları kabul eder; diğer alfabeler bu sürümde desteklenmez.
- Özel alanlar: 32 anahtar, anahtar başına 100 karakter, metin değeri başına 2.000 karakter, ürün başına 8 KiB. İç içe nesne/dizi kabul edilmez. Tekrarlı ve ayrılmış Excel başlıkları sütun numarası içeren güvenli, benzersiz anahtarlara dönüştürülür.

SheetJS 0.18.5 yerine üreticinin [resmî 0.20.3 dağıtımı](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) kullanılır; paket kilidinde tarball integrity bulunur. XLS/XLSX/UTF-8 CSV için gerçek dosya testleri vardır.

## Migration ve işletim

019 kanonik benzersiz ürün indekslerini ve `product_import_jobs`, `product_import_batches`, `product_import_rows` tablolarını ekler. 001–018 dosyaları değiştirilmez. Migrator session advisory lock kullanır; kendi BEGIN/COMMIT komutlarını içeren eski dosyaları iç içe transaction olmadan çalıştırır. 019 ve sonrasının transaction'ını runner yönetir. Mevcut kanonik çakışma varsa 019 veri silmeden tamamen geri alınır; çakışma açıkça çözülüp migration yeniden çalıştırılır.

Staged satırlar ve tamamlanmış job'lar güvenli tekrar/inceleme için saklanır. Otomatik temizleme yoktur; yoğun kullanımda PostgreSQL disk büyümesi izlenmelidir. Tarayıcı ölçeği yukarıdaki sınırlarla kısıtlıdır; sınırsız Excel yüklemesi desteklenmez.

```powershell
npm.cmd run db:migrate
npm.cmd run build
npm.cmd test
npx.cmd playwright test
npm.cmd start
```

Build çalışan API sürecini yenilemez; güncel backend için mevcut API durdurulup yeniden başlatılmalıdır. PostgreSQL kapalıysa önce `scripts/start-db.ps1` çalıştırılır.
