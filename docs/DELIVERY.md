# BEDSS 0.1.0 Teslim Raporu

Tarih: 6 Eylül 2026. Gereksinim kaynağı kullanıcı mesajıdır. Proje `C:\BEDSS` içinde boş klasörden geliştirildi; eski proje kodu veya veritabanı kullanılmadı.

## İlk sürümün durumu

| İstenen ilk sürüm modülü | Teslim edilen |
| --- | --- |
| Authentication | E-posta/şifre girişi, bcrypt, PostgreSQL oturumları, HttpOnly çerez, çıkış, aktif hesap kontrolü |
| Rol/yetki altyapısı | 5 rol, işlem izinleri, bayi kullanıcısı bazında izin kaldırma/geri verme; her istekte doğrulama |
| Dashboard | Depo/SKU/aktif oda/alış bazlı stok değeri, minimum stok uyarıları, oda ilerlemesi |
| Bayi yönetimi | Sistem yetkilisiyle bayi oluşturma, işletmeye göre filtrelenmiş liste |
| Depo/lokasyon | Depo oluşturma/listeleme, bölüm/reyon/kat/hücre, buffer/karantina türleri, üst/alt yapı, lokasyon QR üretimi |
| Ürün/stok | Ürün kartı, tüm talep edilen ana metadata alanlarının saklanması, lokasyon/lot/seri stokları, fiziki/rezerve/hasarlı/iade miktarları, gerekçeli fiziki düzeltme |
| Sayım Odaları | Tarih aralığı, tür/yöntem, ürün kapsamı, benzersiz kod/QR, personel/reyona atama, bilirkişi atamasında sistem yetkilisi kısıtı |
| Kör Sayım | Odaya katılım, ayrı bayi onayı, reyon tarama, alt hücre kapsamı, ürün tarama/kilit, fiziksel miktar, birim, durum, fotoğraf, not, bitirme |
| Audit Log | Kullanıcı/zaman/işlem/kayıt ve kritik değişikliklerde önce/sonra; bayi için kendi kayıtları, sistem yetkilisi için global liste |
| Demo verileri | 7 demo hesabı, 2 işletme, 2 depo, 7 lokasyon, 6 ürün/stok, birim dönüşümleri, taslak oda ve atamalar |

## Çalışan ekranlar

- Giriş; davet kodu doğrulama, şifre/evrak başvurusu ve onay bekleme.
- Genel Bakış dashboard.
- Bayiler; yeni bayi formu.
- Depolar & Lokasyonlar; depo/lokasyon formları ve QR penceresi.
- Ürün & Stok; ürün kartları, lokasyon stokları, yeni ürün/stok ve düzeltme formları.
- Sayım Odaları; oda oluşturma, ürün kapsamı, detay, atama, başlama onayı ve oda tamamlaması.
- Tamamlanan oda raporu; pozitif/negatif/değer farkı, düzeltme, onay/ret, reyon özeti, personel ve olaylar.
- Personel & Davetler; davet, evrak indirme/onayı/reddi, bayi personelinin granüler izinlerini düzenleme.
- İşlem Kayıtları; son 200 kayıt üzerinde metin arama.
- Mobil saha; oda/reyon/ürün tarama, miktar, durum/fotoğraf/not, reyon değişimi, mola/olay bildirimi, ilerleme ve sayımı bitirme.

Ekran görüntüleri: [dashboard](dashboard.png), [oda yönetimi](room.png), [mobil oda girişi](mobile-count.png), [mobil aktif sayım](mobile-count-active.png).

## Veritabanı ve API

19 PostgreSQL tablo, 3 sürümlü SQL migration. Şifreler ve oturum/davet sırları düz metin tutulmaz. Fotoğraflar/evraklar yerel diskte, yetki kontrollü API üzerinden sunulur.

İşletme → depo → bölüm → reyon → kat → hücre; ürün → dönüşüm birimleri → lot/seri/lokasyon stokları; oda → kapsam snapshot → atama → kilit → sayım kaydı → fark raporu. Audit kayıtları bu işlemlerin izini tutar.

API grupları: `/auth`, `/invitations`, `/users`, `/documents`, `/photos`, `/businesses`, `/warehouses`, `/locations`, `/products`, `/stocks`, `/dashboard`, `/rooms`, `/count`, `/audit-logs`. Tüm yollar `/api` altındadır. Alanlar ve erişim kuralları [API.md](API.md) içinde listelenmiştir.

## Test ve doğrulama

- Frontend TypeScript + Vite üretim build'i ve backend TypeScript build'i çalıştırıldı.
- Gerçek PostgreSQL ile 9 entegrasyon testi: oturum/yetki/işletme izolasyonu; depo/ürün/stok; oda onayı; eşzamanlı kilit ve kör veri projeksiyonu; rapor/düzeltme/onay; davet/OTP/evrak; mevcut oturumda izin kaldırma; reyonun alt hücreleri ve özel fotoğraflar; OTP deneme sınırı.
- Edge/Playwright son toplu checkpoint çalıştırmasında **3/3 geçti (13,5 saniye)**: masaüstü yönetim ekranları, 390 piksel mobil yerleşim ve odaya katılımdan fark raporuna kadar tam sayım. Count-flow birim alanı seçicisi düzeltildi; son çalıştırmada tam akış 2,6 saniyede geçti.
- `npm run format:check` başarılı. Kurulum sırasında npm bağımlılık denetimi 0 güvenlik açığı bildirdi; bu, uygulama güvenlik denetimi anlamına gelmez.
- Entegrasyon ve tarayıcı testleri `bedss_test` veritabanını kullanır. Ana `bedss` demo verisi korunur.
- Fiziksel kamera/QR donanımı, internet üzerinden dağıtım, yük testi ve üretim altyapısı doğrulanmadı.

## Henüz tamamlanmayan gereksinimler ve sınırlar

| Alan | Bu sürümdeki sınır / kalan iş |
| --- | --- |
| E-posta teslimi | Gerçek SMTP/e-posta servisi bağlı değil. Yerel demo davet bağlantısı ve OTP, davet oluşturan yetkiliye gösterilir. OTP/evrak/aktivasyon akışı çalışır. |
| Yönetim kapsamı | Bayi/depo/lokasyon/ürün için oluşturma ve listeleme mevcut; mevcut kartların genel düzenleme, arşivleme ve silme ekranları yok. Fiziki stok düzeltme mevcut. |
| Personel | Davet, onay ve bayi izinleri mevcut. Genel personel rol değiştirme, devre dışı bırakma ve yeniden davet akışları yok. |
| Operasyonel hareketler | Mal kabul, evrak fotoğrafı üzerinden kabul, put-away, iç transfer ve sevkiyat modülleri yok. |
| Fire ve kalite | Sayımda hasarlı/bozuk/iade durumu ve fotoğraf mevcut. Ayrı fotoğraflı fire süreci, karantina giriş/çıkış/onayları ve satışa kapalı miktar muhasebesi tamamlanmadı. |
| Buffer / sanal raf | Lokasyon türü olarak mevcut; özel yerleştirme/transfer kuralları yok. |
| QR / barkod | Odalara ve lokasyonlara QR üretilir; ürün barkodu okunur/saklanır. Depo seviyesinde ayrı etiket, Code128 üretimi ve toplu etiket baskısı yok. |
| Döngüsel / dinamik sayım | Tür ve manuel kapsam seçimi mevcut. Otomatik periyodik/dinamik oda üretimi yok. |
| Karışık ürün durumları | Bir stok kalemi için tek toplam miktar ve tek durum kaydı. Aynı kalemde normal/hasarlı/iade miktarlarını ayrı ayrı sayma yok. Sergi/bozuk için ayrı stok bakiyesi yok. |
| Fotoğraf ve olaylar | Sayım fotoğrafı yükleme/indirme mevcut. Kaza/hasar olayının ayrıca fotoğraf alanı yok; olaylar metin kaydıdır. Mola talebinin onay/geri dönüş iş akışı yok. |
| Raporlama | Oda farkları, değer, reyon özeti ve personelin kalem sayısı/ilk-son giriş zamanı mevcut. Excel/PDF dışa aktarım, gelişmiş performans ölçümü ve ürün bazlı birleşik fark geçmişi ekranı yok. Eski oda raporları saklanır. |
| Ölçek | Liste uçları ilk sürüm için genel liste döndürür; audit son 200 kayıtla sınırlı. Sunucu sayfalaması, yüksek hacimli optimizasyon ve yük testi yapılmadı. |
| Dağıtım | Yerel çalışan geliştirme/demonstrasyon sürümü. HTTPS, gerçek e-posta, üretim DB kullanıcı ayrımı, yedekleme, kalıcı dosya servisi ve izleme dağıtımı yapılmadı. |

Electron, native Android ve offline-first eklenmedi. Mikroservis kurulmadı.

## Demo ve komutlar

Demo hesapları, tek tek sayım deneme adımları ve Windows/Docker çalıştırma komutları [README.md](../README.md) içindedir. Ortak demo şifresi `BedssDemo!2026`; ana hesaplar `admin@bedss.local`, `bayi@bedss.local`, `sayim@bedss.local`, `bilirkisi@bedss.local`, `misafir@bedss.local`.
