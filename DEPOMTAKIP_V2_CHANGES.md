# DepomTakip V2 - 28.09.2026

Bu sürüm mevcut güçlü DepomTakip-main tabanı üzerine güncellendi.

## Yetki modeli
- DepomTakip Merkez (SUPER_ADMIN): tüm bayiler, lisanslar, cihazlar ve global sistem.
- Bayi Yetkilisi (OWNER/FIRM_ADMIN): sadece kendi bayisini yönetir.
- Depo Görevlisi (WAREHOUSE_STAFF): mal kabul, yerleştirme, transfer, sevkiyat, hasar/karantina gibi günlük depo operasyonları.
- Sayım Görevlisi (COUNTER): yalnız atanmış sayımlarda kör sayım yapar.

## Lisans modeli
Lisans bayi bazındadır. Depo Görevlisi ve Sayım Görevlisi ayrı lisans anahtarı girmez. Personel, Bayi Yetkilisi tarafından oluşturulur ve bayiye bağlanır. Bayinin lisansı pasif/süresi dolmuşsa bağlı personelin online erişimi de durur.

## Mobil
Sayımda el terminali yerine telefon/PWA esas alınmıştır. Barkod/QR telefon kamerasıyla okunur. Kör sayım kayıtları offline saklanır ve bağlantı geri geldiğinde senkronize edilir.

## Marka
Yeni DepomTakip logosu `web/public/depomtakip-logo.png` olarak eklendi. Electron ürün adı ve kurulum adı DepomTakip olarak güncellendi.

## Giriş akışı
- Merkez: e-posta + şifre.
- Bayi Yetkilisi: bayi kodu + 6 haneli kullanıcı numarası + 6 haneli PIN; yalnız ilk aktivasyonda bayi lisans anahtarı.
- Depo/Sayım Görevlisi: bayi kodu + 6 haneli personel numarası + 6 haneli PIN; lisans anahtarı alanı yoktur.
