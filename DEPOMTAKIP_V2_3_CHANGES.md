# DepomTakip V2.3 - Sayım Görevlisi Telefon / Kör Sayım

- COUNTER rolü genel saha menüsünden ayrıldı ve özel `CounterShell` mobil arayüzüne taşındı.
- Sayım görevlisi ekranda sadece kendi görevini, bağlantı durumunu ve kör sayım akışını görür.
- Sistem stoğu / beklenen miktar mobil sayım ekranında gösterilmez.
- İnternet kesildiğinde aktif sayım cihazdaki snapshot ve offline oturum üzerinden devam eder.
- Offline kayıt sayacı kullanıcı + bayi kapsamında gösterilir.
- İnternet geri geldiğinde senkronizasyon otomatik tetiklenir.
- 15 saniyelik güvenli senkronizasyon yeniden deneme kontrolü eklendi.
- Bekleyen, başarısız ve çakışmalı kayıtlar sayım görevlisine sade durum kartlarıyla gösterilir.
- Kullanıcı herhangi bir lisans kodu girmez; bağlı olduğu bayinin lisansı ve yetkileri kullanılır.
- Telefon/PWA arayüzünde büyük dokunma alanları ve 16px giriş alanları ile mobil kullanılabilirlik güçlendirildi.
