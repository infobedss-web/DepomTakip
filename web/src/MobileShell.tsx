import { useEffect, useState } from 'react';
import {
  Home,
  ScanLine,
  ClipboardCheck,
  RefreshCw,
  UserRound,
  MoreHorizontal,
  Wifi,
  WifiOff,
  LogOut,
  Warehouse,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import type { Row } from './api';
import { roles } from './api';
import { Counting } from './Counting';

type MobilePage =
  | 'home'
  | 'scan'
  | 'count'
  | 'operations'
  | 'sync'
  | 'profile';

export function MobileShell({
  user,
  logout,
}: {
  user: Row;
  logout: () => Promise<void>;
}) {
  const [page, setPage] = useState<MobilePage>('home');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);

    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : [];

  const navigate = (next: MobilePage) => setPage(next);

  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <div>
          <small>DepomTakip SAHA</small>
          <strong>{user.name}</strong>
        </div>

        <span className={online ? 'mobile-online online' : 'mobile-online offline'}>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <main className="mobile-content">
        {page === 'home' && (
          <>
            <section className="mobile-welcome">
              <div>
                <span className="mobile-eyebrow">ÇALIŞMA ALANI</span>
                <h1>Merhaba, {user.name?.split(' ')[0]}</h1>
                <p>
                  Sayım, barkod ve depo işlemlerinize buradan devam edebilirsiniz.
                </p>
              </div>

              <div className={online ? 'connection-card online' : 'connection-card offline'}>
                {online ? <Wifi size={22} /> : <WifiOff size={22} />}
                <div>
                  <strong>
                    {online ? 'Sunucu bağlantısı aktif' : 'Offline çalışma'}
                  </strong>
                  <small>
                    {online
                      ? 'Yeni işlemler sunucuya gönderilebilir.'
                      : 'Sayım kayıtları bağlantı gelene kadar cihazda tutulur.'}
                  </small>
                </div>
              </div>
            </section>

            <section className="mobile-quick-grid">
              <button onClick={() => navigate('scan')}>
                <ScanLine size={28} />
                <span>
                  <strong>Barkod / QR Tara</strong>
                  <small>Ürün veya lokasyon okut</small>
                </span>
                <ChevronRight size={19} />
              </button>

              <button onClick={() => navigate('count')}>
                <ClipboardCheck size={28} />
                <span>
                  <strong>Sayım</strong>
                  <small>Normal ve kör sayım görevleri</small>
                </span>
                <ChevronRight size={19} />
              </button>

              <button onClick={() => navigate('operations')}>
                <MoreHorizontal size={28} />
                <span>
                  <strong>İşlemler</strong>
                  <small>Yetkili depo işlemleri</small>
                </span>
                <ChevronRight size={19} />
              </button>

              <button onClick={() => navigate('sync')}>
                <RefreshCw size={28} />
                <span>
                  <strong>Senkronizasyon</strong>
                  <small>Bağlantı ve bekleyen kayıtlar</small>
                </span>
                <ChevronRight size={19} />
              </button>
            </section>

            <section className="mobile-card">
              <div className="mobile-card-title">
                <Warehouse size={21} />
                <div>
                  <strong>Çalışma Yetkileri</strong>
                  <small>Sunucu tarafından verilen aktif izinler</small>
                </div>
              </div>

              <div className="mobile-permission-list">
                {permissions.length ? (
                  permissions.map((permission: string) => (
                    <span key={permission}>{permission}</span>
                  ))
                ) : (
                  <span>Tanımlı ek izin bulunmuyor</span>
                )}
              </div>
            </section>
          </>
        )}

        {(page === 'scan' || page === 'count') && (
          <section className="mobile-count-area">
            <div className="mobile-section-heading">
              <div>
                <small>
                  {page === 'scan' ? 'BARKOD / QR' : 'SAHA SAYIMI'}
                </small>
                <h2>
                  {page === 'scan'
                    ? 'Tara ve İşleme Devam Et'
                    : 'Sayım Görevleri'}
                </h2>
              </div>
            </div>

            <Counting user={user} logout={logout} />
          </section>
        )}

        {page === 'operations' && (
          <>
            <div className="mobile-section-heading">
              <div>
                <small>DEPO</small>
                <h2>İşlemler</h2>
              </div>
            </div>

            <section className="mobile-operation-list">
              <div>
                <Warehouse />
                <span>
                  <strong>Depo / Lokasyon</strong>
                  <small>Atandığınız depo ve lokasyonlarda çalışın.</small>
                </span>
              </div>

              <div>
                <ScanLine />
                <span>
                  <strong>Barkod İşlemleri</strong>
                  <small>Ürün veya lokasyon barkodunu okutun.</small>
                </span>
              </div>

              <div>
                <ClipboardCheck />
                <span>
                  <strong>Kör Sayım</strong>
                  <small>Beklenen stok gösterilmeden kontrollü sayım.</small>
                </span>
              </div>

              <div>
                <ShieldCheck />
                <span>
                  <strong>Yetki Kontrolü</strong>
                  <small>
                    İşlemler bayi, depo ve kullanıcı yetkisine göre sunucuda doğrulanır.
                  </small>
                </span>
              </div>
            </section>
          </>
        )}

        {page === 'sync' && (
          <>
            <div className="mobile-section-heading">
              <div>
                <small>OFFLINE</small>
                <h2>Senkronizasyon</h2>
              </div>
            </div>

            <section className="mobile-card">
              <div className="mobile-sync-status">
                {online ? <Wifi size={34} /> : <WifiOff size={34} />}

                <div>
                  <strong>
                    {online ? 'Bağlantı mevcut' : 'İnternet bağlantısı yok'}
                  </strong>
                  <p>
                    {online
                      ? 'Bekleyen offline kayıtlar bağlantı sırasında senkronizasyon için hazırdır.'
                      : 'Sayım sırasında oluşturulan kayıtlar cihazda korunur ve bağlantı geldiğinde gönderilir.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="primary mobile-wide-button"
                onClick={() => window.dispatchEvent(new Event('online'))}
                disabled={!online}
              >
                <RefreshCw size={19} />
                Bağlantıyı Yeniden Kontrol Et
              </button>
            </section>
          </>
        )}

        {page === 'profile' && (
          <>
            <div className="mobile-section-heading">
              <div>
                <small>HESABIM</small>
                <h2>Profil</h2>
              </div>
            </div>

            <section className="mobile-profile-card">
              <div className="mobile-profile-avatar">
                {user.name?.[0]?.toUpperCase()}
              </div>

              <h2>{user.name}</h2>
              <p>{user.email}</p>

              <div className="mobile-profile-info">
                <div>
                  <small>Rol</small>
                  <strong>{roles[user.role] || user.role}</strong>
                </div>

                <div>
                  <small>Durum</small>
                  <strong>{user.status || 'ACTIVE'}</strong>
                </div>
              </div>

              <button
                type="button"
                className="secondary mobile-wide-button"
                onClick={() => void logout()}
              >
                <LogOut size={19} />
                Güvenli Çıkış
              </button>
            </section>
          </>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobil menü">
        <button
          className={page === 'home' ? 'selected' : ''}
          onClick={() => navigate('home')}
        >
          <Home />
          <span>Ana Sayfa</span>
        </button>

        <button
          className={page === 'scan' ? 'selected' : ''}
          onClick={() => navigate('scan')}
        >
          <ScanLine />
          <span>Tara</span>
        </button>

        <button
          className={page === 'count' ? 'selected' : ''}
          onClick={() => navigate('count')}
        >
          <ClipboardCheck />
          <span>Sayım</span>
        </button>

        <button
          className={page === 'operations' ? 'selected' : ''}
          onClick={() => navigate('operations')}
        >
          <MoreHorizontal />
          <span>İşlemler</span>
        </button>

        <button
          className={page === 'sync' ? 'selected' : ''}
          onClick={() => navigate('sync')}
        >
          <RefreshCw />
          <span>Senkron</span>
        </button>

        <button
          className={page === 'profile' ? 'selected' : ''}
          onClick={() => navigate('profile')}
        >
          <UserRound />
          <span>Profil</span>
        </button>
      </nav>
    </div>
  );
}