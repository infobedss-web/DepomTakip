# BEDSS Commercial V1 RC2 - Windows doğrulama

Bu doğrulama geliştirici/build bilgisayarında yapılır. Müşteri bilgisayarına Node.js veya PostgreSQL kurdurma modeli değildir.

## Ön koşul
- Node.js 22.12+ veya 24 LTS
- BEDSS'in bağlanacağı PostgreSQL test veritabanı ve doğru `DATABASE_URL`

## Tek komut
PowerShell'i proje kökünde açın:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-commercial.ps1
```

Script sırasıyla şunları durdurur/geçirir:
1. `npm ci`
2. `npm run build`
3. `npm run db:migrate`
4. `npm run db:seed`
5. `npm test`

Bir adım hata verirse sonraki adıma geçmez. Çıktıyı ChatGPT'ye göndererek gerçek hatadan devam edin.

## Otomatik testten sonra manuel P0 kapıları
- Android Chrome: PWA ana ekrana ekleme, kamera, barkod.
- iPhone Safari: PWA ana ekrana ekleme, kamera, barkod.
- İnterneti kes: kör sayım oluştur/kaydet.
- Uygulamayı kapat/aç: offline kayıt korunmalı.
- İnterneti aç: yalnız aktif firma/kullanıcı kayıtları senkronize olmalı.
- Aynı operasyon tekrar gönderildiğinde stok iki kez değişmemeli.
- Firma A verisi Firma B oturumunda görünmemeli.

Bu kontroller tamamlanmadan paket `FINAL` olarak adlandırılmamalıdır.
