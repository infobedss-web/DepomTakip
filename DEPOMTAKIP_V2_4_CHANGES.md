# DepomTakip V2.4 — Bayi Yetkilisi Operasyon Merkezi

## Yeni
- Bayi Yetkilisi giriş yaptıktan sonra doğrudan **Operasyon Merkezi** açılır.
- 15 saniyede bir otomatik yenilenen canlı operasyon görünümü eklendi.
- Aktif personel, depo görevlisi ve sayım görevlisi sayıları tek ekranda gösterilir.
- Açık sayımlar, inceleme bekleyen sayımlar ve onaylanan sayımlar özetlenir.
- Mobil cihazlar **online / offline** olarak son 2 dakikalık heartbeat'e göre izlenir.
- Canlı sayım kartlarında toplam ürün, sayılan ürün ve katılan personel ilerlemesi gösterilir.
- Tamamlanmış sayımlardaki farklı ürün ve toplam mutlak stok farkı Bayi Yetkilisine gösterilir.
- İkinci kör sayım açılmış mı bilgisi kontrol merkezinde görünür.
- Son audit işlemleri (kim, ne yaptı, ne zaman) canlı akışta gösterilir.
- Sayım Odaları, Personel, Mobil Cihazlar ve Depo/Lokasyon ekranlarına hızlı geçişler eklendi.

## Güvenlik
- `/bayi-control-center` API'si yalnızca `OWNER` (Bayi Yetkilisi) rolüne açıktır.
- Veriler yalnızca giriş yapan Bayinin `business_id` alanı üzerinden sorgulanır.
- Başka bir bayinin personeli, sayımı, cihazı veya audit kaydı kontrol merkezine dahil edilmez.

## Değişmeyen temel kurallar
- Lisans Bayiye aittir; Depo Görevlisi ve Sayım Görevlisi ayrı lisans kullanmaz.
- Sayım Görevlisi beklenen stok miktarını göremez.
- Offline kayıt/senkronizasyon altyapısı korunur.
- Stok farkı yetkili onayı olmadan doğrudan gerçek stoğa işlenmez.
