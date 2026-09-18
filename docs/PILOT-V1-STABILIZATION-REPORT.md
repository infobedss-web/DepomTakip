# BEDSS PILOT V1 STABILIZATION REPORT

Tarih: 12 Eylül 2026. Aktif proje: C:\BEDSS.

1. **İlk durum**
   İlk işlem `npm test` oldu: 31 test, 13 PASS, 18 FAIL, 0 skipped. Süre 90,06 saniye. C:\BEDSS Git deposu değil; mevcut değişiklikler Git üzerinden ayrıştırılamadı. Kök workspace API ve Web'i kapsıyor; mobile ayrı React Native projesi, Electron aynı API/Web çıktılarını paketliyor. İlgili package.json dosyaları incelendi.

2. **18 test hatasının kök nedeni**
   POST /api/businesses artık zorunlu `code` bekliyor (2–50 karakter, harf/rakam/nokta/alt çizgi/tire, büyük harfe dönüştürme). Dört test kurulumu yalnız name ve tax_number gönderiyordu. Alanın adı business_code/company_code değil, code. tax_number için 10–11 rakam validasyonu doğru ve korundu. integration içindeki 9 ve workflows içindeki 7 test ortak kuruluma bağlı; count-session ve licensing ile toplam 18 hata aynı noktadan kaynaklanıyordu.
   Bu engel kaldırılınca başka sorunlar görünür oldu: depo code fixture eksikliği ve global benzersizlik; kapatılmış POST /stocks kullanımına devam eden fixture'lar; belgesiz etkinleştirme yerine eski belge/onay akışını bekleyen test; API'deki eski user_limit/warehouse_limit sorguları; COUNTER'ın yönetim ve atanmamış oda erişimini açan gerilemeler.

3. **Değiştirilen dosyalar**
   API: api/src/auth.ts, api/src/management.ts, api/src/security.ts, api/src/helpers.ts.
   Test: api/test/integration.test.ts, api/test/count-session.test.ts, api/test/licensing.test.ts, api/test/workflows.test.ts. Yeni ortak yardımcı: api/test/fixtures.ts.
   Bu rapor eklendi. API/Web build çıktıları yeniden üretildi. Mobile, Electron ve Web kaynak kodu değiştirilmedi; D:\BEDSS'ten dosya kopyalanmadı.

4. **Her dosyada yapılan değişiklik**

   | Dosya | Değişiklik |
   |---|---|
   | auth.ts | Davet lisans kontrolündeki user_limit, şemadaki max_users alanına düzeltildi. Limit kontrolü korunuyor. |
   | management.ts | Depo lisans kontrolündeki warehouse_limit, max_warehouses alanına düzeltildi. Firma/depo validasyonu ve doğrudan stok girişinin kapalı olması korundu. |
   | security.ts | COUNTER yeniden yönetim verisi erişiminden engellendi; AUDITOR engeli korundu. |
   | helpers.ts | COUNTER oda erişiminde tenant/depo yetkisi ve oda ataması birlikte aranıyor. AUDITOR oda ataması kontrolü korundu. |
   | integration.test.ts | Firma/depo kodları eklendi; başlangıç stokları ortak fixture'a taşındı. Kapalı stok endpoint'i 405 ile sınanıyor; negatif stok API kontrolü, DB rezerve miktar kısıtı ve yabancı tenant erişim reddi korunuyor. Davet testi güncel belgesiz etkinleşmeye uyarlandı; OTP/replay ve özel fotoğraf testleri korunuyor. |
   | count-session.test.ts | Firma/depo kodları ve ortak stok fixture'ı kullanıldı. |
   | licensing.test.ts | Firma kodu eklendi. Lisans yaşam döngüsü beklentileri değişmedi. |
   | workflows.test.ts | Firma/depo kodları eklendi; başlangıç stokları ortak fixture'a taşındı. Hareket, audit, eşzamanlılık ve tenant doğrulamaları API üzerinde kaldı. |
   | fixtures.ts | Yalnız adı _test ile biten veritabanında mevcut stok hazırlayan SQL yardımcısı. Production endpoint'i taklit etmez veya açmaz. |

5. **npm test sonucu: 31/31 PASS**
   Son tam koşu: 31 test, 31 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; çıkış kodu 0; süre 49,45 saniye. Test sayısı düşürülmedi. Sonuç araç çıktısından doğrulandı. test-results/pilot-v1-tests.log ve pilot-v1-targeted.log ara başarısız koşulara aittir; son sonucu temsil etmez.

6. **npm run build sonucu**
   PASS, çıkış kodu 0. API `tsc` PASS. Web `tsc -b && vite build` PASS; 1600 modül, Vite 6,83 saniye. Build öncesi mevcut dist çıktıları da yedeklendi.

7. **Mobile durumu**
   C:\BEDSS\mobile aktif kabul edildi. App.tsx yalnız React Native NewAppScreen başlangıç ekranını içeriyor; src dizini yok. Firma/personel giriş, depo, ürün, barkod, kör sayım, offline kuyruk, yeniden bağlantıda sync, idempotency ve API bağlantısı bu aktif uygulamada uygulanmış değil. Yüklü bağımlılıkların varlığı çalışan özellik anlamına gelmez. Mobil Jest testi 1/1 PASS; yalnız örnek ekran render testi.
   D:\BEDSS\mobile yalnız okundu: src/api/client.js, offline/queue.js, offline/snapshot.js, sync/syncService.js mevcut. API adresi 192.168.1.11:4000 olarak sabit. Kuyruk genel bir AsyncStorage anahtarı kullanıyor; okuma/değiştirme/yazma ve sync sırasında kuyruk yenileme eşzamanlı eklemeleri kaybetme riski taşıyor. Bu ikinci proje aktif projeye aktarılmadı ve cihazda doğrulanmadı.

8. **Android build durumu: FAIL**
   `gradlew.bat assembleDebug --no-daemon --offline`: react-native-keychain için AGP 8.3.1 önbellekte bulunamadığından başarısız.
   Bağımlılık indirmeli `gradlew.bat assembleDebug --no-daemon`: bağımlılık/configuration aşamalarını geçti; `:app:buildCMakeDebug[arm64-v8a]` aşamasında `java.io.IOException: Diskte yeterli yer yok` ile başarısız oldu. Sonrasında C: yaklaşık 2195 MiB, D: yaklaşık 15947 MiB boştu. Başarılı APK üretildiği iddia edilmiyor.
   Ek derleme uyarıları: KSP 2.2.0-2.0.2 / Kotlin 2.2.10 uyumsuzluk uyarısı ve eski AGP API kullanımları. Release yapılandırması debug imzasını kullanıyor; dağıtım imzası doğrulanmadı.

9. **Electron durumu**
   electron/main.cjs `node --check` PASS. electron-runtime production bağımlılık listesi eksiksiz; Node ve PostgreSQL runtime dosyaları mevcut. extraResources güncel api/dist ve web/dist'i paketliyor; BrowserWindow aynı yerel API'nin sunduğu Web'i açıyor. contextIsolation=true, nodeIntegration=false, sandbox=true.
   GUI açılışı, temiz makine kurulumu ve NSIS paketi bu çalışmada çalıştırılmadı; Electron uçtan uca PASS denemez. İlk kurulum initdb --auth=trust kullanıyor, PostgreSQL localhost'a bağlı; API 0.0.0.0 dinliyor. Sabit yerel DB kimlik bilgileri, demo seed ve ağ erişimi pilot dağıtımında ayrıca ele alınmalı.

10. **Web durumu**
    Production build PASS. /api göreli adresi ve cookie oturumu Electron'ın aynı-origin mimarisiyle uyumlu. Web'de ayrı MobileShell/Counting ve IndexedDB offline modülleri var; bunlar C:\BEDSS\mobile native uygulamasının işlevleri değildir. Tarayıcı/gerçek kamera ve uçtan uca offline senaryoları bu çalışmada çalıştırılmadı.

11. **Güvenlik / tenant / kör sayım kontrolleri**
    Geçen testler: tenant izolasyonu, rol sınırları, depo/oda ataması, owner onayı, aktif oturum izin değişikliği, kör sayım projection, COUNTER stok/ürün/dashboard/audit erişim reddi, özel fotoğraf erişimi, ürün kilitleri ve çift sayım reddi, eşzamanlı stok aşımı reddi, import replay/yarış ve rollback, immutable audit, lisans askıya alma/süre/yeniden etkinleşme, OTP deneme ve replay engeli.
    Production validasyonu veya güvenlik beklentileri gevşetilmedi. Offline snapshot sorgusunda expected/physical/fiyat alanları döndürülmüyor. Bu statik inceleme, offline güvenliğinin tamamının uçtan uca doğrulandığı anlamına gelmez.

12. **Hâlâ kalan hatalar ve doğrulama açıkları**
    - Aktif native mobilin BEDSS işlevleri eksik; mobil pilot kullanıma hazır değil.
    - Android build disk alanı hatasıyla FAIL; release imza ve cihaz çalışması doğrulanmadı.
    - Web offline işlem kayıtları user_id/business_id taşımıyor; logout yalnız offline kullanıcıyı temizliyor. Hesap değişiminde kuyruk sahipliği ve snapshot izolasyonu ayrıca düzeltilip sınanmalı. Sync yalnız PENDING/FAILED seçtiğinden kapanışta SYNCING kalan kayıtların kurtarılması doğrulanmalı.
    - API client_operations idempotency yanıtı iş transaction'ından ayrı/asenkron kaydediliyor; anahtar gövde hash'ine bağlı değil. Sunucu/istemci çökmesi ve aynı anahtarın farklı payload ile kullanılması için atomiklik ve replay senaryoları açık. Mevcut 31 test bu HTTP idempotency katmanını kapsamlı sınamıyor; PASS sonucu buna genişletilemez.
    - Electron ilk açılış/kurulum, LAN bağlantısı ve Web/Electron gerçek offline testleri yapılmadı. LAN üzerinden production Secure cookie/HTTPS ve kamera erişimi doğrulanmalı.
    - Test tax_number üretiminin bazı fixture'larda zaman tabanlı kalması tekrar/paralel koşulda çakışma riski taşır; son tam koşu sorunsuz geçti.

13. **Pilot kullanıma çıkmadan önce yapılması gerekenler**
    Aktif mobil kaynak kapsamını belirleyip eksik uygulamayı ayrı onaylı çalışma olarak tamamlayın; D: projesini otomatik taşımayın. Android için yeterli disk alanı sağlayıp debug/release derlemeyi ve gerçek cihaz testlerini tamamlayın. Offline kullanıcı/tenant sahipliği, kesinti sonrası kuyruk kurtarma ve idempotency çökme senaryolarını kapatın. Electron temiz kurulum/yeniden başlatma, HTTPS/LAN, gerçek barkod kamerası, depo ataması iptali, bağlantı kaybı/geri gelişi ve hesap değişimi senaryolarını sınayın. Pilot hesapları ve dağıtım kimlik bilgilerini hazırlayın.
    API test/build hedefi tamamlandı; tüm platformlar için pilot hazır onayı verilmedi.

14. **Yedeklerin konumu**
    C:\BEDSS\backups\pilot-v1-20260912\api\src ve api\test: değiştirilen mevcut kaynakların işlem öncesi kopyaları.
    C:\BEDSS\backups\pilot-v1-20260912\generated\api\dist ve generated\web: build öncesi API/Web dist ve Web tsbuildinfo kopyaları.
    fixtures.ts ve bu rapor yeni dosyalardır; önceki sürümleri yoktur. Android denemeleri oluşturulmuş build/cache dosyaları üretti; mevcut mobile kaynakları değiştirilmedi. Testler _test veritabanında veri oluşturdu; production veritabanına test uygulanmadı.
