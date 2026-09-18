# BEDSS REST API

Taban yol `/api`. JSON istek/yanıt, dosyalar için `multipart/form-data`. Oturum çerezi `bedss_session`; giriş sonrası aynı istemcide çerez korunmalıdır. Kimlik alanları UUID'dir. Tarihler ISO 8601 UTC, miktarlar en fazla 3 ondalıklıdır. PostgreSQL `numeric` alanları çoğunlukla JSON'da metin olarak döner.

Hata biçimi: `{ "error": "Türkçe açıklama", "details": ["isteğe bağlı alan hataları"] }`. 400 doğrulama, 401 oturum, 403 yetki/işletme, 404 bulunamadı, 409 durum veya kilit çakışması, 429 hız sınırı.

## Kimlik ve personel

| Yöntem / Yol | İstek | Erişim / Sonuç |
| --- | --- | --- |
| GET `/health` | — | PostgreSQL bağlantı kontrolü |
| POST `/auth/login` | `email,password` | Aktif hesap, 12 saatlik çerez |
| GET `/auth/me` | — | Aktif kullanıcı ve etkin izinler |
| POST `/auth/logout` | — | Oturumu geçersiz kılar |
| POST `/invitations` | `name,email,role,business_id,permissions?` | `kullanici_yonet`; OWNER sadece kendi COUNTER/GUEST hesaplarını davet eder |
| POST `/auth/verify` | `token,otp` | 24 saatlik davet; en fazla 5 yanlış OTP; tek kullanımlık doğrulama |
| POST `/auth/complete` | multipart `token,password,document` | OTP sonrası PDF/PNG/JPEG, 5 MB; hesap evrak onayına geçer |
| GET `/users` | — | İşletmeye göre filtrelenmiş personel, evrak listesi ve izinler |
| POST `/users/:id/review` | `approve: boolean` | Sadece SUPER_ADMIN, evrak onayı veya ret |
| PUT `/users/:id/permissions` | `permissions: string[],denied_permissions: string[]` | Sadece SUPER_ADMIN; OWNER izinlerini daraltma/geri verme |
| POST `/photos` | multipart `photo` | `sayim_yap`, JPEG/PNG, 5 MB; `id` döner |
| GET `/documents/:id` | — | Kendi dosyası, SUPER_ADMIN veya kendi işletmesindeki sayıma bağlı fotoğraf için rapor yetkilisi |

Davet teslimi bu sürümde **LOCAL_DEMO** adaptörüdür: cevapta `invite_url` ve `otp` döner. Gerçek e-posta gönderilmez. Davet sırrı ve OTP veritabanında yalnızca hash olarak saklanır; audit içine yazılmaz. Dosyalar herkese açık statik klasörden sunulmaz.

## Yönetim

| Yöntem / Yol | İstek / Açıklama | Yetki |
| --- | --- | --- |
| GET `/dashboard` | Depo, SKU, aktif oda, stok değeri, minimum stok, son odalar | `rapor_izle` |
| GET `/businesses` | Kapsamdaki işletmeler | Yönetim / misafir |
| POST `/businesses` | `name,tax_number` (10–11 rakam) | SUPER_ADMIN |
| GET `/warehouses` | Kapsamdaki depolar | Yönetim / misafir |
| POST `/warehouses` | `business_id,name,address?` | `depo_yonet` |
| GET `/locations` | Üst lokasyon ve depo bilgileri | Yönetim / misafir |
| POST `/locations` | `warehouse_id,parent_id?,name,kind` | `depo_yonet`; hiyerarşi denetlenir |
| GET `/locations/:id/qr` | `{code,image}`; image PNG data URL | `qr_yonet` |
| GET `/products` | Ürün kartları ve dönüşüm birimleri | Yönetim / misafir |
| POST `/products` | Aşağıdaki ürün alanları | `urun_yonet` |
| GET `/stocks` | Lokasyon, lot/seri, fiziki/rezerve/hasarlı/iade miktarları | Yönetim / misafir |
| POST `/stocks` | `product_id,location_id,physical,reserved?,damaged?,returned?,lot?,serial?` | `stok_duzelt` |
| PATCH `/stocks/:id` | `physical,reason` | `stok_duzelt`; aktif/onay bekleyen oda stoklarında engellenir |
| GET `/audit-logs` | Son 200 işlem, işletme filtresi | `log_izle`; global kapsam SUPER_ADMIN |

Ürün alanları: `business_id,sku,barcode,name,category,subcategory,brand,model,variant,purchase_price,sale_price,vat,supplier,min_stock,max_stock,abc,box_size,pallet_size`. İlk dört kimlik/ad alanı gereklidir. `box_size=12`, `pallet_size=144` varsayılanları vardır. Baz birim Adet'tir.

Lokasyon türleri: `ZONE,RACK,FLOOR,BIN,BUFFER,QUARANTINE`. COUNTER/AUDITOR, yönetim GET uçlarından da 403 alır; yalnızca düğmeler gizlenmez.

## Oda ve rapor

| Yöntem / Yol | İstek / Sonuç |
| --- | --- |
| GET `/rooms` | Yönetici kendi işletmesi; saha yalnızca atandığı odalar |
| POST `/rooms` | `warehouse_id,name,count_type,method,starts_at,ends_at,stock_ids?`; `sayim_olustur` |
| GET `/rooms/:id` | Oda, QR, atamalar, yönetici için ürün kapsamı; saha için yalnızca kendi atamaları |
| POST `/rooms/:id/assignments` | `user_id,location_id`; bilirkişi ataması sadece SUPER_ADMIN |
| POST `/rooms/:id/open` | Taslak → açık, snapshot ve kapsam çakışması denetimi; `sayim_onayla` |
| POST `/rooms/:id/approve-person` | `user_id`; katılmış personelin başlamasına onay |
| POST `/rooms/:id/complete` | Tüm ürünler sayılmışsa açık → tamamlandı |
| GET `/rooms/:id/report` | Tamamlanan/onaylanan/reddedilen odada beklenen, sayılan, fark, değer farkı, personel, olaylar; `rapor_izle` |
| PATCH `/rooms/:id/entries/:entry` | `quantity,reason`; miktar **Adet** olarak düzeltilir, önce/sonra loglanır; `stok_duzelt` |
| POST `/rooms/:id/review` | `action: APPROVE/REJECT,reason`; tamamlanmış oda; tekrar onay engellenir |

Türler `FULL,PARTIAL,CYCLIC,RACK`; yöntemler `INTERNAL,AUDITOR,HYBRID`. Tam sayım depo stoklarını kapsar. Diğer türlerde `stock_ids` seçilmelidir. Döngüsel tür etiket/kapsam olarak bulunur; periyodik oda üretme zamanlayıcısı yoktur.

## Kör sayım

Bu uçların tümü `sayim_yap` gerektirir. Aktif oda, atama, katılım, bayi onayı ve zaman aralığı sunucuda doğrulanır.

| Yöntem / Yol | İstek / Sonuç |
| --- | --- |
| POST `/count/join` | `code` (oda QR metni); bayi onayı bekleyen katılım |
| POST `/count/location` | `room_id,code` (reyon/lokasyon QR metni); tek aktif lokasyon |
| POST `/count/scan` | `room_id,barcode,lot?,serial?,location_code?`; ürün kilidi alır |
| POST `/count/submit` | `room_id,stock_id,quantity,unit,condition,note?,photo_id?`; kaydeder ve kilidi bırakır |
| POST `/count/release` | Kullanıcının açık ürün kilidini bırakır |
| GET `/count/progress/:id` | Yalnızca kullanıcının kayıtları ve aktif lokasyonu |
| POST `/count/incident` | `room_id,kind: BREAK/DAMAGE/ACCIDENT,note` |
| POST `/count/finish` | `room_id`; personelin oda görevini kapatır |

Tarama yanıtı açık alan listesiyle oluşturulur: `stock_id,location_id,product_id,name,sku,barcode,variant,lot,serial,units`. **physical, expected, reserved, fiyat ve fark alanları yoktur.** Birim çarpanları beklenen miktar değildir. İlerleme ekranı yalnızca personelin kendi girdiği miktarları gösterir.

Durumlar `NORMAL,DAMAGED,RETURNED,DISPLAY,BROKEN`. Bu temel sürümde bir stok kalemine tek durum ve tek toplam miktar kaydedilir; aynı kalem içinde normal/hasarlı/iade miktarlarını ayrı satırlara bölen gelişmiş akış henüz yoktur.
