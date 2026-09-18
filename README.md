# BEDSS — İlk çalışan sürüm

BEDSS, bu klasörde sıfırdan geliştirilmiş bağımsız bir depo ve sayım uygulamasıdır. Gereksinim kaynağı kullanıcı mesajıdır; ayrıca bir teknik doküman dosyası sağlanmamıştır.

## Çalıştırma

Gerekenler: Node.js 22.12+ veya 24 ve PostgreSQL 17. Mevcut ortamda Node 24 ve PostgreSQL 17 ile doğrulandı.

```powershell
cd C:\BEDSS
npm.cmd ci
powershell -ExecutionPolicy Bypass -File .\scripts\start-db.ps1
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run build
npm.cmd start
```

Uygulama ve REST API birlikte **http://127.0.0.1:4000** adresinde açılır. Sağlık kontrolü: `/api/health`.

Geliştirme sırasında:

```powershell
npm.cmd run dev
```

React/Vite: http://127.0.0.1:5173 — API: http://127.0.0.1:4000. Vite `/api` isteklerini backend'e yönlendirir. `Ctrl+C` uygulamayı durdurur. Yalnızca BEDSS PostgreSQL sunucusunu durdurmak için `scripts/stop-db.ps1` kullanılır.

`start-db.ps1`, yalnızca `C:\BEDSS\.postgres` veri klasörünü kullanır ve 55432 portunda loopback arayüzüne bağlanır. Başka projelerin veritabanlarına veya servislerine dokunmaz. Bu yerel geliştirme kümesi `trust` doğrulaması kullanır; üretim kurulum betiği değildir.

Docker alternatifi (yerel PostgreSQL ile aynı anda aynı portta başlatmayın):

```powershell
docker compose up -d database
Copy-Item api/.env.example api/.env
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run build
npm.cmd start
```

Docker test veritabanı oluşturma:

```powershell
docker compose exec database createdb -U bedss bedss_test
```

Bağlantı varsayılanı `postgresql://bedss:bedss_local@127.0.0.1:55432/bedss`. Başka bağlantı için `api/.env` içinde `DATABASE_URL` ayarlanır. Örnek dosya `api/.env.example` içindedir. Migration betikleri sürümlüdür ve transaction içinde uygulanır. Seed, kullanıcı varsa mevcut verileri değiştirmez.

## Demo hesapları

Tüm demo hesaplarının şifresi: **`BedssDemo!2026`**

| Hesap | Rol | Kapsam |
| --- | --- | --- |
| admin@bedss.local | Sistem Yetkilisi | Global |
| bayi@bedss.local | Bayi Yetkilisi | Marmara Lojistik |
| sayim@bedss.local | Sayım Görevlisi | Marmara Lojistik |
| sayim2@bedss.local | İkinci Sayım Görevlisi | Kilit senaryoları |
| bilirkisi@bedss.local | Bağımsız Bilirkişi | Yalnızca atandığı odalar |
| misafir@bedss.local | Salt okunur Denetçi | Marmara Lojistik |
| ege@bedss.local | İkinci Bayi Yetkilisi | Ege Dağıtım; işletme ayrımı |

Demo: 2 işletme, 2 depo, 7 lokasyon, 6 ürün, Adet/Koli/Palet birimleri, lot bazlı stoklar ve bir taslak sayım odası. Eylül Depo Sayımı başlangıç/bitişi seed zamanına göre belirlenir.

## Kör sayımı deneme

1. Bayi hesabıyla **Sayım Odaları → Eylül Depo Sayımı → Odayı Sayıma Aç**.
2. Ayrı tarayıcı profili veya gizli pencerede sayım hesabıyla giriş yapın. **Oda kodu:** `BEDSS-DEMO`.
3. Bayi ekranında **Yenile → Başlamayı Onayla**. Personel ekranında **Onay Durumunu Yenile**.
4. Reyon kodu `LOC-A01` tarayın/girin. Ürün barkodu `8690000000011` veya SKU `SKU-1001`.
5. Fiziksel miktarı ve birimi seçip kaydedin. `2 Koli` sunucuda `24 Adet` olarak hesaplanır. Beklenen miktar sayım API'sine dahil edilmez.
6. Aynı reyondaki diğer ürünler `SKU-1002`, `SKU-1003`; `LOC-A02` reyonundakiler `SKU-1004`, `SKU-1005`, `SKU-1006`.
7. Personel **Sayımı Bitir** işlemini kullanabilir. Bayi, tüm 6 kalem sayıldıktan sonra **Odayı Tamamla** ile raporu açar.
8. Farkları inceleyin; gerekçeli düzeltme yapın veya odanın sonuçlarını onaylayın/reddedin. Onay stok miktarlarını günceller; ret stokları değiştirmez.

Kamera, tarayıcının `BarcodeDetector` ve kamera desteğini kullanır. Destek yoksa elle kod veya klavye gibi çalışan barkod okuyucu kullanılabilir. Gerçek telefon kamerası donanımı test edilmedi. Ağdaki telefonlardan kullanım için HTTPS ve erişilebilir sunucu adresi kurulumu ayrıca gerekir; mevcut çalıştırma yerel bilgisayara bağlıdır.

## Mimari

```text
BEDSS/
├── web/                 React + TypeScript + Vite
│   ├── src/             Türkçe yönetim ve saha ekranları
│   └── e2e/             Edge / Playwright tarayıcı testleri
├── api/
│   ├── src/
│   │   ├── app.ts       HTTP güvenliği, REST yönlendirmeleri, hata yanıtları
│   │   ├── auth.ts      Oturum, davet, OTP, evrak ve izin yönetimi
│   │   ├── security.ts  Roller, izinler ve işletme erişim kontrolleri
│   │   ├── management.ts İşletme, depo, ürün, stok, dashboard, log
│   │   ├── counting.ts  Oda, atama, kör sayım, kilit ve rapor işlemleri
│   │   ├── helpers.ts   İşletme ve lokasyon kapsamı denetimleri
│   │   ├── database.ts PostgreSQL havuzu, transaction ve migration
│   │   └── seed.ts      Bağımsız BEDSS demo verileri
│   ├── test/            Gerçek PostgreSQL entegrasyon testleri
│   └── uploads/         Erişim kontrollü evrak/fotoğraf depolaması
├── database/            Sürümlü SQL migration dosyaları
├── scripts/             BEDSS yerel PostgreSQL başlat/durdur betikleri
├── docs/                API, kapsam raporu ve ekran görüntüleri
└── docker-compose.yml   İsteğe bağlı PostgreSQL servisi
```

Tek backend uygulaması, REST API, PostgreSQL ve npm workspaces. Üretim derlemesinde Express React dosyalarını da sunar. SQL parametreli sorgularla çalışır. İşletme sınırı sunucuda uygulanır; PostgreSQL RLS bu sürümde kullanılmaz. DB bağlantısı yalnızca backend'e verilir.

Oturumlar veritabanında SHA-256 özetiyle, şifreler bcrypt ile saklanır. Tarayıcıya HttpOnly/SameSite=Strict çerez verilir. Aktif olmayan kullanıcı giriş yapamaz. İzinler her istekte veritabanından okunur: `(rol izinleri ∪ ek izinler) − kaldırılan izinler`. Saha ve misafir rollerine yönetim yetkisi yükseltmesi kapalıdır.

Sayım transaction'larında oda satır kilidi, personel advisory lock ve benzersiz ürün/reyon kilidi birlikte kullanılır. Bir personel bir aktif lokasyon ve bir ürün kilidi tutabilir. Reyon QR'sı alt kat/hücre stoklarını kapsar. Kilit aynı reyondaki farklı hücre ve lotlarda da aynı ürünün eşzamanlı sayılmasını engeller. Birden fazla eşleşmede lot/seri/hücre koduyla ayrım yapılır. Terk edilmiş kilit için personelin **Yarım kalan ürün kilidimi bırak** işlemi vardır; otomatik süre aşımı yoktur.

Oda açılırken beklenen miktar ve alış fiyatı snapshot alınır. Aktif/onay bekleyen odalarda aynı stok tekrar sayıma açılamaz ve manuel miktarı değiştirilemez. Rapor tamamlanmadan açılmaz. Stok güncellemesi, onay ve audit kaydı aynı transaction içindedir.

## Veritabanı

19 tablo: `schema_versions`, `businesses`, `users`, `sessions`, `invitations`, `documents`, `warehouses`, `locations`, `products`, `product_units`, `stocks`, `rooms`, `room_items`, `assignments`, `active_locations`, `count_locks`, `count_entries`, `incidents`, `audit_logs`.

- İşletme → depo → bölüm → reyon → kat → hücre. Lokasyonlar kendine referanslı üst/alt hiyerarşidir; buffer ve karantina türleri desteklenir.
- Ürünler işletmeye bağlıdır. SKU ve barkod işletme içinde benzersizdir.
- Stoklar ürün + lokasyon + lot + seri temelinde tutulur. Miktarlar `numeric(14,3)`, fiyatlar `numeric(14,2)`.
- Sayım kapsamı `room_items`, sonuçlar `count_entries`, beklenen miktar `room_items.expected` alanındadır. Beklenen alan saha yanıtına gönderilmez.
- Denetim kayıtları kullanıcı, zaman, işlem, kayıt kimliği ve gerekli önce/sonra değerlerini içerir. API'de log silme/değiştirme ucu yoktur; veritabanı yöneticisine karşı değiştirilemez kayıt garantisi verilmez.

## Testler

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run format:check
```

Entegrasyon testleri yalnızca adı `_test` ile biten veritabanında çalışır. Varsayılan `bedss_test`; alternatif için `TEST_DATABASE_URL`. Gerçek transaction, SQL kısıtları ve HTTP istekleri kullanılır. Her çalıştırmada benzersiz test verileri eklenir; çalışma demosu değişmez.

Playwright kurulu Microsoft Edge'i kullanır, 4100 portunda geçici uygulama başlatır ve test veritabanına bağlanır. Ekran görüntüleri `docs/`, başarısız test çıktıları `test-results/` altına yazılır. Tarayıcı testinden önce `npm run build` gereklidir.

Detaylı REST sözleşmesi: [docs/API.md](docs/API.md). Tamamlanan ve kalan gereksinimler: [docs/DELIVERY.md](docs/DELIVERY.md).

Teknik başvuru kaynakları: [Vite başlangıç belgesi](https://vite.dev/guide/), [PostgreSQL açık kilitleme belgesi](https://www.postgresql.org/docs/17/explicit-locking.html).
