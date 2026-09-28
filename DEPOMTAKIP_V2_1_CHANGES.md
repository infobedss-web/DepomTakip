# DepomTakip V2.1

Bu sürüm bayi-personel lisans modelini uygulamada netleştirir.

- Bayi Yetkilisi kendi bayisi için hızlıca **Depo Görevlisi** veya **Sayım Görevlisi** oluşturabilir.
- Personel hesabı 6 haneli personel numarası + 6 haneli PIN ile açılır.
- Personelden ayrı lisans anahtarı istenmez; erişim bayinin aktif lisansına bağlıdır.
- Personel oluşturma bayi lisansının kullanıcı limitini kontrol eder.
- Personel oluşturma işlemi tenant/bayi izolasyonuyla sunucuda doğrulanır.
- Personel için depo atama altyapısı korunur.
- Offline cihaz kimliği `depomtakip_device_id` adına taşındı; eski `bedss_device_id` varsa otomatik devralınır.
- Offline kuyruk olayı DepomTakip adıyla güncellendi.
- Uygulama görünür ve online durumdayken offline kuyruk 60 saniyede bir otomatik tekrar denenir.
