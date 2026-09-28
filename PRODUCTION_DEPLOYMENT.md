# DepomTakip Commercial V1 RC4 - Production Deployment

## Hedef mimari

- Web/PWA + `/api`: Vercel (HTTPS)
- Veritabanı: yönetilen PostgreSQL
- Kamera: HTTPS üzerinden tarayıcı izni ile; Cloudflare Quick Tunnel production için gerekli değildir.
- Dosya/fotoğraf içeriği: PostgreSQL `documents.content` (`031_document_content.sql`), yerel diske bağımlı değildir.

## GitHub'a gönderilmemesi gerekenler

`.env*` (örnek dosya hariç), `.postgres/`, `node_modules/`, `backend/dist/`, `web/dist/`, `uploads/`, sertifikalar, loglar, ZIP'ler, test raporları ve yerel teşhis dosyaları `.gitignore` kapsamındadır.

## İlk production kurulumu

1. Yönetilen PostgreSQL veritabanını oluşturun.
2. Deployment ortamında `DATABASE_URL` tanımlayın.
3. Yeni veritabanında bir kez `npm run db:migrate` çalıştırın.
4. Gerekliyse demo yerine gerçek bootstrap/yönetici kurulum akışını kullanın; production veritabanına demo seed uygulamayın.
5. GitHub reposunu Vercel'e bağlayın. Root dizin repo kökü olmalıdır.
6. Vercel build komutu: `npm run build`; output: `web/dist`.
7. `/api/health` yanıtını doğrulayın: `status=ok`, `application=DepomTakip`, `database=PostgreSQL`.
8. Telefon üzerinden PWA giriş, kamera izni, reyon QR, EAN-13, online/offline kuyruk ve kör sayım testlerini yapın.

## Önemli

`api/index.mjs` Express uygulamasını Vercel function olarak dışa aktarır. Migration deployment isteği sırasında otomatik çalıştırılmaz; production DB migration'ı deployment öncesi kontrollü olarak çalıştırılmalıdır.


## Demo verilerini sıfırlama

Demo/test ortamında yönetim panelindeki **Yönetim > Demo Verilerini Sıfırla** ekranını açmak için sunucuda `DEMO_RESET_ENABLED=true` tanımlayın. Production müşteri ortamında bu değişkeni tanımlamayın veya `false` bırakın. Endpoint yalnızca `SUPER_ADMIN` rolüne açıktır, tam onay metni ister ve demo dışı bir firma algılarsa işlemi reddeder.

## V2.6 Production güvenlik kontrolü

Deploy öncesi production ortam değişkenlerini tanımlayın ve çalıştırın:

```bat
VERIFY_PRODUCTION.bat
```

Zorunlu:
- `DATABASE_URL`: PostgreSQL bağlantı URL'si
- `APP_ORIGIN`: HTTPS production adresi, örn. `https://depomtakip.com`
- `NODE_ENV=production`

Önerilen:
- `SESSION_SECRET`: en az 32 karakter güçlü secret

## PostgreSQL yedekleme

`DATABASE_URL` tanımlıyken:

```bat
BACKUP_DEPOMTAKIP.bat
```

Yedekler `backups/` klasörüne PostgreSQL custom formatında yazılır ve yanında SHA-256 checksum dosyası üretilir.

## PostgreSQL geri yükleme

Restore bilinçli olarak tek tık değildir. Açık onay parametresi gerekir:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/restore-db.ps1 -BackupFile .\backups\depomtakip-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

Restore öncesi hedef veritabanının doğru olduğundan emin olun.
