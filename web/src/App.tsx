import {
  useEffect,
  useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Warehouse,
  Package,
  ClipboardCheck,
  Users,
  History,
  LogOut,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Search,
  ShieldCheck,
  Menu,
  Boxes,
  ScanLine,
  EyeOff,
  Smartphone,
  RotateCcw,
} from 'lucide-react';
import { api, roles, labels, date, num, money, type Row } from './api';
import {
  clearOfflineUser,
  getOfflineUser,
  saveOfflineUser,
} from './offlineSession';
import { Badge, DataForm, Empty, Modal, type Field } from './components';
import { Rooms } from './Rooms';
import { BlindCounting } from './BlindCounting';
import { GoodsReceipt } from './GoodsReceipt';
import { PutAway } from './PutAway';
import { InternalTransfer } from './InternalTransfer';
import { WarehouseTransfer } from './WarehouseTransfer';
import { Shipment } from './Shipment';
import { Incidents } from './Incidents';
import { Quarantine } from './Quarantine';
import { StockAdjustment } from './StockAdjustment';
import { ProductImport } from './ProductImport';
import { InitialStock } from './InitialStock';
import { MobileShell } from './MobileShell';
import { LicenseManager } from './LicenseManager';
import { BedssGuide } from './BedssGuide';
import { MobileDevices } from './MobileDevices';
const nav = [
  ['dashboard', 'Genel Bakış', LayoutDashboard],
  ['mobile-devices', 'Mobil Cihazlar', Smartphone],
  ['businesses', 'Firmalar', Building2],
  ['locations', 'Depolar & Lokasyonlar', Warehouse],
  ['products', 'Ürün & Stok', Package],
  ['product-import', 'Excel / CSV Ürün Aktar', Package],
  ['initial-stock', 'Başlangıç Stoğu', Boxes],
  ['goods-receipts', 'Mal Kabul', Package],
  ['put-away', 'Rafa Yerleştirme', Warehouse],
  ['internal-transfer', 'Depo İçi Transfer', Warehouse],
  ['warehouse-transfer', 'Depolar Arası Transfer', Warehouse],
  ['shipments', 'Sevkiyat / Mal Çıkışı', Package],
  ['incidents', 'Hasar / Karantina', ShieldCheck],
  ['quarantine', 'Karantina Yönetimi', ShieldCheck],
  ['stock-adjustments', 'Stok Düzeltme', Package],

  ['rooms', 'Sayım Odaları', ClipboardCheck],
  ['blind-counting', 'Kör Sayım', EyeOff],
  ['users', 'Personel & Davetler', Users],
  ['logs', 'İşlem Kayıtları', History],
  ['system-demo', 'Demo Verilerini Sıfırla', RotateCcw],
] as const;

const navGroups = [
  {
    id: 'stock',
    label: 'Stok Yönetimi',
    keys: ['products', 'initial-stock', 'stock-adjustments', 'product-import'],
  },
  {
    id: 'movements',
    label: 'Stok Hareketleri',
    keys: ['goods-receipts', 'put-away', 'internal-transfer', 'warehouse-transfer', 'shipments'],
  },
  {
    id: 'counting',
    label: 'Sayım',
    keys: ['rooms', 'blind-counting'],
  },
  {
    id: 'quality',
    label: 'Hasar & Karantina',
    keys: ['incidents', 'quarantine'],
  },
  {
    id: 'personnel',
    label: 'Personel',
    keys: ['users'],
  },
  {
    id: 'management',
    label: 'Yönetim',
    keys: ['businesses', 'locations', 'logs', 'system-demo'],
  },
] as const;

export function App() {
  const [user, setUser] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState('dashboard'),
    [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() =>
      localStorage.getItem('bedss_selected_business_id'),
    ),
    [menu, setMenu] = useState(false),
    [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
      stock: true,
      movements: true,
      counting: false,
      quality: false,
      personnel: false,
      management: false,
    });
  useEffect(() => {
    void (async () => {
      try {
        const r =
          await api('/auth/me');

        setUser(r.user);

        if (r.user.role === 'WAREHOUSE_STAFF') {
          setPage('goods-receipts');
        }

        await saveOfflineUser(
          r.user,
        );
      } catch {
        const cached =
          await getOfflineUser();

        if (cached) {
          setUser(cached);

          if (cached.role === 'WAREHOUSE_STAFF') {
            setPage('goods-receipts');
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  if (loading) return <div className="loading">BEDSS yükleniyor…</div>;
  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) return <Onboarding token={invite} />;
  if (!user) return <Login onLogin={setUser} />;
  const field = ['COUNTER', 'AUDITOR', 'GUEST'].includes(user.role);
  const warehouseStaff = user.role === 'WAREHOUSE_STAFF';
  const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  const can = (p: string) => userPermissions.includes(p);
  const warehouseStaffKeys = new Set([
    'goods-receipts',
    'put-away',
    'internal-transfer',
    'warehouse-transfer',
    'shipments',
    'incidents',
    'quarantine',
  ]);

  const visible = nav.filter(([key]) => {
    if (warehouseStaff) {
      return warehouseStaffKeys.has(key);
    }

    if (key === 'system-demo') return user.role === 'SUPER_ADMIN';

    return key === 'product-import'
      ? can('urun_yonet')
      : key === 'users'
        ? can('kullanici_yonet')
        : key === 'logs'
          ? can('log_izle')
          : true;
  });

  const dashboardItem = visible.find(([key]) => key === 'dashboard');
  const mobileDevicesItem = visible.find(([key]) => key === 'mobile-devices');

  const itemsForGroup = (keys: readonly string[]) =>
    visible.filter(([key]) => keys.includes(key));

  const toggleGroup = (id: string) => {
    setOpenGroups((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  const logout = async () => {
    try {
      if (navigator.onLine) {
        await api(
          '/auth/logout',
          'POST',
        );
      }
    } finally {
      await clearOfflineUser();
      localStorage.removeItem('bedss_selected_business_id');
      setSelectedBusinessId(null);
      setUser(null);
      setPage('dashboard');
    }
  };
  if (field) return <MobileShell user={user} logout={logout} />;
  return (
    <div className="app-shell">
      <aside className={menu ? 'sidebar expanded' : 'sidebar'}>
        <a className="brand" href="#" onClick={() => setPage('dashboard')}>
          <span className="brand-icon">
            <Boxes size={24} />
          </span>
          BEDSS<span className="brand-dot">®</span>
        </a>
        <div className="workspace-tag">
          <span className="workspace-avatar">B</span>
          <div>
            Depo Yönetim Sistemi<small>Yönetim çalışma alanı</small>
          </div>
        </div>
        <div className="nav-label">ÇALIŞMA ALANI</div>
        <nav>
          {mobileDevicesItem &&
            (() => {
              const [key, label, Icon] = mobileDevicesItem;
              return (
                <button
                  key={key}
                  className={page === key ? 'nav-item selected' : 'nav-item'}
                  onClick={() => {
                    setPage(key);
                    setMenu(false);
                  }}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </button>
              );
            })()}
          {dashboardItem &&
            (() => {
              const [key, label, Icon] = dashboardItem;
              return (
                <button
                  key={key}
                  className={page === key ? 'nav-item selected' : 'nav-item'}
                  onClick={() => {
                    setPage(key);
                    setMenu(false);
                  }}
                >
                  <Icon size={19} />
                  {label}
                </button>
              );
            })()}

          {navGroups.map((group) => {
            const items = itemsForGroup(group.keys);
            if (!items.length) return null;

            const active = items.some(([key]) => key === page);
            const opened = openGroups[group.id] || active;

            return (
              <div className="nav-group" key={group.id}>
                <button
                  type="button"
                  className={active ? 'nav-group-button active' : 'nav-group-button'}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={opened}
                >
                  <span>{group.label}</span>
                  <span className={opened ? 'nav-chevron open' : 'nav-chevron'}>
                    ›
                  </span>
                </button>

                {opened && (
                  <div className="nav-group-items">
                    {items.map(([key, label, Icon]) => (
                      <button
                        key={key}
                        className={page === key ? 'nav-item selected' : 'nav-item'}
                        onClick={() => {
                          setPage(key);
                          setMenu(false);
                        }}
                      >
                        <Icon size={18} />
                        {key === 'product-import' ? 'Toplu Ürün Aktar' : label}
                        {key === 'rooms' && <span className="nav-new">SAYIM</span>}
                        {key === 'blind-counting' && <span className="nav-new">KÖR</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure">
            <ShieldCheck size={18} />
            <span>
              Güvenli çalışma alanı<small>Rol ve yetki kontrollü erişim</small>
            </span>
          </div>
          <button className="profile" onClick={logout}>
            <span className="avatar">{user.name[0]}</span>
            <span>
              {user.name}
              <small>{roles[user.role]}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Menü"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Çalışma Alanı <ChevronRight size={14} />{' '}
            <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="top-status">
            <BedssGuide role={user.role} page={page} navigate={setPage} />
            <span className="live-dot" /> Sistem aktif <span className="divider" />{' '}
            <span className="avatar small">{user.name[0]}</span>
          </div>
        </header>
        <div className="page-content">
          {page === 'dashboard' ? (
            <Dashboard navigate={setPage} user={user} />
          ) : page === 'product-import' ? (
            <ProductImport user={user} />
          ) : page === 'initial-stock' ? (
            <InitialStock user={user} />
          ) : page === 'rooms' ? (
            <Rooms user={user} />
          ) : page === 'blind-counting' ? (
            <BlindCounting user={user} />
          ) : page === 'goods-receipts' ? (
            <GoodsReceipt user={user} />
          ) : page === 'put-away' ? (
            <PutAway />
          ) : page === 'internal-transfer' ? (
            <InternalTransfer />
          ) : page === 'warehouse-transfer' ? (
            <WarehouseTransfer />
          ) : page === 'shipments' ? (
            <Shipment />
          ) : page === 'incidents' ? (
            <Incidents />
          ) : page === 'mobile-devices' ? (
            <MobileDevices />
          ) : page === 'system-demo' ? (
            <DemoReset />
          ) : (
            <Management
              key={page}
              page={page}
              user={user}
              selectedBusinessId={selectedBusinessId}
              onSelectBusiness={(id) => {
                setSelectedBusinessId(id);
                localStorage.setItem('bedss_selected_business_id', id);
              }}
            />
          )}
        </div>
        <footer>
          BEDSS <span>Depo ve Sayım Yönetim Sistemi</span>
          <span>İlk sürüm · 0.1.0</span>
        </footer>
      </main>
    </div>
  );
}
function DemoReset() {
  const [status, setStatus] = useState<Row | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = async () => {
    try {
      setStatus(await api('/system/demo-reset/status'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  const resetDemo = async () => {
    if (confirmation !== 'DEMO VERİLERİNİ SIFIRLA') return;
    if (!window.confirm('Demo verileri silinip başlangıç verileri yeniden oluşturulacak. Devam edilsin mi?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/system/demo-reset', 'POST', { confirmation });
      setMessage(result.message || 'Demo verileri sıfırlandı.');
      setConfirmation('');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="page-heading">
        <div><span className="eyebrow">SİSTEM YÖNETİMİ</span><h1>Demo Verilerini Sıfırla</h1></div>
      </div>
      <div className="card">
        <h3>Demo ortamını başlangıç durumuna getir</h3>
        <p className="muted">Sayım, stok, hareket, atama ve diğer demo kayıtları temizlenir; BEDSS başlangıç demo verileri yeniden oluşturulur.</p>
        {status && !status.enabled && <div className="notice">Bu ortamda demo sıfırlama kapalı. Sunucuda <code>DEMO_RESET_ENABLED=true</code> tanımlayın.</div>}
        {status && status.enabled && !status.safe_to_reset && <div className="error">Gerçek firma verisi algılandı. Güvenlik nedeniyle sıfırlama engellendi.</div>}
        {error && <div className="error">{error}</div>}
        {message && <div className="notice">{message}</div>}
        <label>Onay metni
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="DEMO VERİLERİNİ SIFIRLA" />
        </label>
        <button type="button" className="danger" disabled={busy || !status?.enabled || !status?.safe_to_reset || confirmation !== 'DEMO VERİLERİNİ SIFIRLA'} onClick={() => void resetDemo()}>
          <RotateCcw size={17} /> {busy ? 'Sıfırlanıyor…' : 'Demo Verilerini Sıfırla'}
        </button>
      </div>
    </section>
  );
}

function Login({ onLogin }: { onLogin: (u: Row) => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Boxes />
          </span>
          BEDSS
        </div>
        <div>
          <span className="eyebrow">DEPO VE SAYIM YÖNETİMİ</span>
          <h1>
            Her ürünün yeri.
            <br />
            Her sayımın izi.
          </h1>
          <p>Depolarınızı, stoklarınızı ve saha ekibinizi tek bir çalışma alanından yönetin.</p>
          <div className="story-grid">
            <div>
              <Warehouse />
              <strong>Düzenli depolar</strong>
              <small>Lokasyondan hücreye tam görünürlük</small>
            </div>
            <div>
              <ScanLine />
              <strong>Güvenilir sayım</strong>
              <small>Kör sayım ve kontrollü saha akışı</small>
            </div>
          </div>
        </div>
        <small>BEDSS · Yeni ve bağımsız bir başlangıç</small>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="eyebrow">ÇALIŞMA ALANINIZA HOŞ GELDİNİZ</span>
          <h2>Hesabınıza giriş yapın</h2>
          <p className="muted">Devam etmek için e-posta adresinizi ve şifrenizi girin.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const b = Object.fromEntries(new FormData(e.currentTarget));
              try {
                const result = await api('/auth/login', 'POST', b);
                const loggedInUser = result.user;

                if (loggedInUser.role !== 'SUPER_ADMIN') {
                  await api('/license/me');
                }

                onLogin(loggedInUser);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              E-posta adresi
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="ad@isletme.com"
                required
              />
            </label>
            <label>
              Şifre
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                minLength={1}
              />
            </label>

            <label>
              Lisans Anahtarı
              <input
                type="text"
                name="license_key"
                autoComplete="off"
                placeholder="BEDSS-TRIAL-XXXX-XXXX-XXXX-XXXX"
              />
              <small>
                Yalnızca ilk firma yöneticisi girişinde girilir.
                Daha önce etkinleştirdiyseniz boş bırakın.
              </small>
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <div className="demo-note">
            <strong>Yerel demo</strong>
            <p>
              bayi@bedss.local · sayim@bedss.local
              <br />
              Şifre: <code>BedssDemo!2026</code>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
function Onboarding({ token }: { token: string }) {
  const [step, setStep] = useState(1),
    [error, setError] = useState('');
  return (
    <div className="onboarding">
      <div className="card">
        <h1>BEDSS’e katılın</h1>
        <p className="muted">Davet → OTP doğrulama → Hesap oluşturma</p>
        {step === 1 ? (
          <DataForm
            submit="Kodu Doğrula"
            fields={[{ name: 'otp', label: '6 haneli doğrulama kodu' }]}
            onSubmit={async (b) => {
              await api('/auth/verify', 'POST', { token, ...b });
              setStep(2);
            }}
          />
        ) : step === 2 ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              const b = new FormData(e.currentTarget);
              b.set('token', token);
              try {
                await api('/auth/complete', 'POST', b);
                setStep(3);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Şifre (en az 12 karakter, büyük/küçük harf ve rakam)
              <input name="password" type="password" minLength={12} maxLength={72} required />
            </label>
            
            {error && <div className="alert error">{error}</div>}
        
<button className="primary">Hesabı Tamamla</button>
          </form>
        ) : (
          <>
            <div className="alert">
              Hesabınız oluşturuldu. Giriş yapabilirsiniz.
            </div>
            <a href="/">Giriş ekranına dön</a>
          </>
        )}
      </div>
    </div>
  );
}
function Dashboard({ navigate, user }: { navigate: (p: string) => void; user: Row }) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEPO OPERASYONLARINIZ, TEK BAKIŞTA</div>
          <h1>Genel Bakış</h1>
          <p>Merhaba {user.name.split(' ')[0]}, çalışma alanınızın güncel durumu burada.</p>
        </div>
        <span className="date-chip">
          {new Date().toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>
      {error && <div className="alert error">{error}</div>}
      {data && (
        <>
          <div className="stats-grid">
            {[
              ['Toplam Depo', data.metrics.warehouses, Warehouse, 'İşletmelerinize bağlı depolar'],
              ['Ürün Çeşidi', data.metrics.products, Package, 'Kayıtlı benzersiz SKU'],
              [
                'Aktif Sayım',
                data.metrics.active_rooms,
                ClipboardCheck,
                'Sahada devam eden odalar',
              ],
              ['Stok Değeri', money(data.metrics.stock_value), Boxes, 'Alış fiyatı üzerinden'],
            ].map(([title, value, Icon, sub]) => {
              const I = Icon as typeof Warehouse;
              return (
                <div className="stat card" key={String(title)}>
                  <div className="stat-top">
                    <span>{String(title)}</span>
                    <span className="stat-icon">
                      <I size={20} />
                    </span>
                  </div>
                  <strong>{String(value)}</strong>
                  <small>{String(sub)}</small>
                </div>
              );
            })}
          </div>
          <div className="dashboard-grid">
            <section className="card rooms-summary">
              <div className="section-head">
                <div>
                  <h2>Sayım Odaları</h2>
                  <p className="muted">Sayım operasyonlarınızın ilerlemesini takip edin.</p>
                </div>
                <button className="text-button" onClick={() => navigate('rooms')}>
                  Tümünü gör <ChevronRight size={16} />
                </button>
              </div>
              {data.rooms.length ? (
                data.rooms.map((r: Row) => (
                  <div className="summary-room" key={r.id}>
                    <span className="room-icon">
                      <ClipboardCheck size={22} />
                    </span>
                    <div className="room-info">
                      <strong>{r.name}</strong>
                      <small>
                        {r.warehouse_name} · {labels[r.count_type]}
                      </small>
                      <div className="progress">
                        <span
                          style={{
                            width: `${Number(r.total) ? (Number(r.counted) / Number(r.total)) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <small>
                        {r.counted} / {r.total} ürün sayıldı
                      </small>
                    </div>
                    <Badge value={r.status} />
                  </div>
                ))
              ) : (
                <Empty />
              )}
            </section>
            <section className="card quick-actions">
              <h2>Hızlı İşlemler</h2>
              <p className="muted">Günlük işlerinize kolayca erişin.</p>
              {([
                ['goods-receipts', 'Mal Kabul', 'Gelen ürünleri kaydedin', Package],
                ['put-away', 'Rafa Yerleştir', 'Kabul Alanındaki ürünleri raflara taşıyın', Warehouse],

                ['rooms', 'Sayım odalarını aç', 'Operasyonu planlayın', ClipboardCheck],
                ['products', 'Stokları incele', 'Ürün ve miktar bilgileri', Package],
                ['locations', 'Depoları görüntüle', 'Fiziksel konumları yönetin', Warehouse],
              ] satisfies [string, string, string, typeof Warehouse][]).map(([key, title, sub, Icon]) => {
                const I = Icon as typeof Warehouse;
                return (
                  <button key={String(key)} onClick={() => navigate(String(key))}>
                    <span className="stat-icon">
                      <I size={20} />
                    </span>
                    <span>
                      <strong>{String(title)}</strong>
                      <small>{String(sub)}</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                );
              })}
            </section>
            <section className="card">
              <div className="section-head">
                <div>
                  <h2>Minimum Stok Uyarıları</h2>
                  <p className="muted">Tanımlanan eşik altında kalan ürünler.</p>
                </div>
                <span className="badge pending_approval">{data.low_stock.length} ürün</span>
              </div>
              {data.low_stock.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th>SKU</th>
                        <th>Mevcut</th>
                        <th>Minimum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.low_stock.map((r: Row) => (
                        <tr key={r.sku}>
                          <td>
                            <strong>{r.name}</strong>
                          </td>
                          <td>{r.sku}</td>
                          <td className="warning-text">{num(r.physical)}</td>
                          <td>{num(r.min_stock)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="Tüm ürünler minimum stok seviyesinin üzerinde." />
              )}
            </section>
            <section className="card assurance">
              <ShieldCheck size={28} />
              <h2>Kontrollü sayım, izlenebilir işlem</h2>
              <p>
                Sayım görevlileri beklenen stok miktarını görmez. Her işlem kullanıcı ve zaman
                bilgisiyle kaydedilir.
              </p>
              <span className="badge active">Kör sayım altyapısı aktif</span>
            </section>
          </div>
        </>
      )}
    </>
  );
}
function Management({
  page,
  user,
  selectedBusinessId,
  onSelectBusiness,
}: {
  page: string;
  user: Row;
  selectedBusinessId: string | null;
  onSelectBusiness: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [aux, setAux] = useState<Record<string, Row[]>>({}),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<string | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [notice, setNotice] = useState<Row | null>(null),
    [tab, setTab] = useState('stocks'),
    [warehouseAssignments, setWarehouseAssignments] = useState<Row[]>([]);
  const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  const can = (p: string) => userPermissions.includes(p);
  const load = async () => {
    setError('');
    try {
      const path =
        page === 'logs'
          ? 'audit-logs'
          : page === 'products'
            ? tab
            : page === 'locations'
              ? 'locations'
              : page;
      setRows(await api('/' + path));
      const names =
        page === 'locations'
          ? ['businesses', 'warehouses', 'locations']
          : page === 'products'
            ? ['businesses', 'products', 'locations']
            : page === 'users'
              ? ['businesses']
              : [];
      const pairs = await Promise.all(names.map(async (n) => [n, await api('/' + n)]));
      setAux(Object.fromEntries(pairs));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [page, tab]);
  const options = (key: string) => {
    const source =
      key === 'warehouses'
        ? scopedWarehouses
        : key === 'locations'
          ? scopedLocations
          : key === 'products'
            ? scopedProducts
            : aux[key] || [];

    return source.map((r) => ({
      value: r.id,
      label: r.name + (r.warehouse_name ? ' · ' + r.warehouse_name : ''),
    }));
  };
  const businessField: Field = {
    name: 'business_id',
    label: 'İşletme',
    options: options('businesses'),
    value: user.business_id || selectedBusinessId || aux.businesses?.[0]?.id,
  };
  const title = nav.find((n) => n[0] === page)?.[1];
  const selectedBusiness =
    aux.businesses?.find((b) => b.id === selectedBusinessId) || null;

  const inSelectedBusiness = (r: Row) => {
    if (user.role !== 'SUPER_ADMIN' || !selectedBusinessId) return true;

    if (page === 'locations')
      return (
        r.business_id === selectedBusinessId ||
        aux.warehouses?.some(
          (w) => w.id === r.warehouse_id && w.business_id === selectedBusinessId,
        )
      );

    if (page === 'products' || page === 'users')
      return r.business_id === selectedBusinessId;

    return true;
  };

  const filtered = rows.filter(
    (r) =>
      inSelectedBusiness(r) &&
      JSON.stringify(r).toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')),
  );

  const scopedWarehouses =
    user.role === 'SUPER_ADMIN' && selectedBusinessId
      ? (aux.warehouses || []).filter((w) => w.business_id === selectedBusinessId)
      : aux.warehouses || [];

  const scopedLocations =
    user.role === 'SUPER_ADMIN' && selectedBusinessId
      ? (aux.locations || []).filter((l) =>
          scopedWarehouses.some((w) => w.id === l.warehouse_id),
        )
      : aux.locations || [];

  const scopedProducts =
    user.role === 'SUPER_ADMIN' && selectedBusinessId
      ? (aux.products || []).filter((p) => p.business_id === selectedBusinessId)
      : aux.products || [];
  let fields: Field[] = [];
  let endpoint = '';
  if (modal === 'business') {
    fields = [
      { name: 'name', label: 'Firma kısa adı' },
      { name: 'code', label: 'Firma kodu' },
      { name: 'legal_name', label: 'Resmi / ticari unvan', required: false },
      { name: 'tax_number', label: 'Vergi / T.C. kimlik numarası' },
      { name: 'tax_office', label: 'Vergi dairesi', required: false },
      { name: 'authorized_person', label: 'Yetkili kişi', required: false },
      { name: 'phone', label: 'Telefon', required: false },
      { name: 'email', label: 'E-posta', type: 'email', required: false },
      { name: 'city', label: 'İl', required: false },
      { name: 'district', label: 'İlçe', required: false },
      { name: 'address', label: 'Açık adres', required: false },
      {
        name: 'status',
        label: 'Firma durumu',
        options: [
          { value: 'ACTIVE', label: 'Aktif' },
          { value: 'PASSIVE', label: 'Pasif' },
        ],
        value: 'ACTIVE',
      },
    ];
    endpoint = 'businesses';
  }
  if (modal === 'warehouse') {
    fields = [
      businessField,
      { name: 'name', label: 'Depo adı' },
          { name: 'code', label: 'Depo kodu' },
      { name: 'city', label: 'İl', required: false },
      { name: 'district', label: 'İlçe', required: false },
      { name: 'responsible_person', label: 'Depo sorumlusu', required: false },
      { name: 'phone', label: 'Telefon', required: false },
      { name: 'address', label: 'Açık adres', required: false },
      {
        name: 'status',
        label: 'Depo durumu',
        options: [
          { value: 'ACTIVE', label: 'Aktif' },
          { value: 'PASSIVE', label: 'Pasif' },
        ],
        value: 'ACTIVE',
      },
    ];
    endpoint = 'warehouses';
  }
  if (modal === 'location') {
    const hierarchyLabel: Record<string, string> = {
      ZONE: 'Bölüm',
      RACK: 'Reyon',
      FLOOR: 'Kat',
      BIN: 'Hücre',
      BUFFER: 'Kabul Alanı',
      QUARANTINE: 'Karantina',
    };

    const hierarchyOrder: Record<string, number> = {
      ZONE: 1,
      RACK: 2,
      FLOOR: 3,
      BIN: 4,
      BUFFER: 5,
      QUARANTINE: 6,
    };

    const parentOptions = [...scopedLocations]
      .sort(
        (a, b) =>
          (hierarchyOrder[a.kind] || 99) - (hierarchyOrder[b.kind] || 99) ||
          String(a.name).localeCompare(String(b.name), 'tr'),
      )
      .map((r) => ({
        value: r.id,
        label:
          (hierarchyLabel[r.kind] || r.kind) +
          ' → ' +
          r.name +
          (r.warehouse_name ? ' · ' + r.warehouse_name : ''),
      }));

    fields = [
      {
        name: 'warehouse_id',
        label: '1. Depo',
        options: options('warehouses'),
      },
      {
        name: 'kind',
        label: '2. Lokasyon türü',
        options: ['ZONE', 'RACK', 'FLOOR', 'BIN', 'BUFFER', 'QUARANTINE'].map((v) => ({
          value: v,
          label: hierarchyLabel[v],
        })),
      },
      {
        name: 'parent_id',
        label: '3. Üst lokasyon',
        options: parentOptions,
        required: false,
      },
      {
        name: 'name',
        label: '4. Lokasyon adı',
      },
    ];

    endpoint = 'locations';
  }
  if (modal === 'product') {
    fields = [
      ...[
        ['sku', 'SKU / Stok kodu *'],
        ['barcode', 'Barkod / EAN / GTIN *'],
        ['name', 'Ürün adı *'],
        ['category', 'Kategori'],
        ['subcategory', 'Alt kategori'],
        ['brand', 'Marka'],
        ['model', 'Model'],
        ['variant', 'Varyant'],
        ['supplier', 'Tedarikçi'],
      ].map(([name, label]) => ({
        name,
        label,
        required: ['sku', 'barcode', 'name'].includes(name),
      })),
      ...[
        'purchase_price',
        'sale_price',
        'vat',
        'min_stock',
        'max_stock',
        'box_size',
        'pallet_size',
      ].map((name, i) => ({
        name,
        label: [
          'Alış fiyatı',
          'Satış fiyatı',
          'KDV (%)',
          'Minimum stok',
          'Maksimum stok',
          '1 koli kaç adet?',
          '1 palet kaç adet?',
        ][i],
        type: 'number',
        value: [0, 0, 20, 0, 1000, 12, 144][i],
      })),
      {
        name: 'abc',
        label: 'ABC sınıfı',
        options: ['A', 'B', 'C'].map((v) => ({ value: v, label: v })),
        value: 'C',
      },
    ];
    endpoint = 'products';
  }
  if (modal === 'adjust') {
    fields = [
      {
        name: 'physical',
        label: 'Yeni fiziki miktar (adet)',
        type: 'number',
        value: selected?.physical,
      },
      { name: 'reason', label: 'Düzeltme gerekçesi' },
    ];
    endpoint = 'stocks/' + selected?.id;
  }
  if (modal === 'invite') {
    fields = [
      businessField,
      { name: 'name', label: 'Ad soyad' },
      { name: 'email', label: 'E-posta', type: 'email' },
      {
        name: 'role',
        label: 'Rol',
        options: (user.role === 'SUPER_ADMIN'
          ? ['FIRM_ADMIN', 'OWNER', 'WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR', 'GUEST']
          : ['WAREHOUSE_STAFF', 'COUNTER', 'GUEST']
        ).map((v) => ({ value: v, label: roles[v] })),
      },
    ];
    endpoint = 'invitations';
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ÇALIŞMA ALANI</div>
          <h1>{title}</h1>
          <p>
            {
              {
                businesses: 'BEDSS sistemine bağlı firmaları ve kurumsal bilgilerini yönetin.',
                locations: 'Depodan hücreye, her fiziksel konum kayıt altında.',
                products: 'Ürün kartlarını, birimleri ve lokasyon stoklarını takip edin.',
                users: 'Personel erişimlerini ve evrak onaylarını yönetin.',
                logs: 'Kim, ne zaman, hangi işlemi yaptı?',
              }[page]
            }
          </p>
        </div>
        <div className="button-row">
          {page === 'businesses' && user.role === 'SUPER_ADMIN' && (
            <button className="primary" onClick={() => setModal('business')}>
              <Plus size={18} />
              Firma Ekle
            </button>
          )}
          {page === 'locations' && can('depo_yonet') && (
            <>
              <button className="secondary" onClick={() => setModal('warehouse')}>
                Depo Ekle
              </button>

              {scopedWarehouses.length > 0 ? (
                <button className="primary" onClick={() => setModal('location')}>
                  <Plus size={18} />
                  Lokasyon Ekle
                </button>
              ) : (
                <button
                  className="primary"
                  type="button"
                  disabled
                  title="Lokasyon eklemek için önce bir depo oluşturmalısınız."
                >
                  <Plus size={18} />
                  Önce Depo Oluşturun
                </button>
              )}
            </>
          )}
          {page === 'products' && (
            <>
              {can('urun_yonet') && (
                user.business_id || selectedBusinessId ? (
                  <button
                    className="secondary"
                    onClick={() => setModal('product')}
                    title={
                      selectedBusiness
                        ? 'Ürün ' + selectedBusiness.name + ' firmasına eklenecek.'
                        : 'Ürün ekle'
                    }
                  >
                    Ürün Ekle
                  </button>
                ) : (
                  <button
                    className="secondary"
                    type="button"
                    disabled
                    title="Önce Firmalar ekranından çalışma firmasını seçmelisiniz."
                  >
                    Önce Firma Seçin
                  </button>
                )
              )}
            </>
          )}
          {page === 'users' && (
            <button className="primary" onClick={() => setModal('invite')}>
              <Plus size={18} />
              Personel Davet Et
            </button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {page === 'locations' && (
        <div className="warehouse-grid">
          {scopedWarehouses.map((w) => (
            <div className="card warehouse-card" key={w.id}>
              <Warehouse size={24} />
              <h3>{w.name}</h3>
              <p>{w.business_name}</p>
              <small>{w.address || 'Adres tanımlanmamış'}</small>
            </div>
          ))}
        </div>
      )}
      {page === 'businesses' && user.role === 'SUPER_ADMIN' && (
        <section className="bedss-firm-center">
          <div className="bedss-firm-center-head">
            <div>
              <div className="eyebrow">BEDSS SUPER ADMIN</div>
              <h2>Firma Yönetim Merkezi</h2>
              <p className="muted">
                BEDSS'e bağlı firmaları, depoları, personelleri ve ürün yapılarını tek merkezden yönetin.
              </p>
            </div>
            <div className="bedss-firm-total">
              <strong>{rows.length}</strong>
              <span>Kayıtlı Firma</span>
            </div>
          </div>

          <div className="bedss-firm-grid">
            {filtered.map((firm) => (
              <article className="bedss-firm-card" key={firm.id}>
                <div className="bedss-firm-card-top">
                  <div className="bedss-firm-avatar">
                    {(firm.name || 'F').slice(0, 1).toLocaleUpperCase('tr')}
                  </div>

                  <div className="bedss-firm-title">
                    <h3>{firm.name}</h3>
                    <span>{firm.legal_name || 'Kurumsal unvan tanımlanmamış'}</span>
                  </div>

                  <span className={'bedss-firm-status ' + (firm.status === 'PASSIVE' ? 'passive' : 'active')}>
                    {firm.status === 'PASSIVE' ? 'Pasif' : 'Aktif'}
                  </span>
                </div>

                <div className="bedss-firm-info">
                  <div>
                    <small>Firma Kodu</small>
                    <strong>{firm.code || '—'}</strong>
                  </div>
                  <div>
                    <small>Vergi No</small>
                    <strong>{firm.tax_number || '—'}</strong>
                  </div>
                  <div>
                    <small>Yetkili</small>
                    <strong>{firm.authorized_person || '—'}</strong>
                  </div>
                  <div>
                    <small>Konum</small>
                    <strong>
                      {[firm.district, firm.city].filter(Boolean).join(' / ') || '—'}
                    </strong>
                  </div>
                </div>

                <div className="bedss-firm-contact">
                  <span>{firm.phone || 'Telefon tanımlanmamış'}</span>
                  <span>{firm.email || 'E-posta tanımlanmamış'}</span>
                </div>

                <div className="bedss-firm-modules">
                  <span>Depolar</span>
                  <span>Personeller</span>
                  <span>Ürünler</span>
                  <span>Stok</span>
                  <span>Sayım</span>
                  <span>Kör Sayım</span>
                </div>

                <div className="bedss-import-banner">
                  <div>
                    <strong>Toplu Ürün Girişi</strong>
                    <small>Excel ile binlerce ürünü güvenli şekilde aktar</small>
                  </div>
                  <span>Excel</span>
                </div>

                <div className="bedss-firm-footer">
                  <small>
                    {firm.address || 'Firma adresi henüz tanımlanmamış.'}
                  </small>

                  <div className="button-row">
                    {selectedBusinessId === firm.id ? (
                      <span className="badge active">Seçili Firma</span>
                    ) : (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          onSelectBusiness(firm.id);
                        }}
                      >
                        Firmayı Aç
                      </button>
                    )}
                    <LicenseManager
                      firm={firm}
                      onSaved={async () => {
                        await load();
                      }}
                    />
                    <strong>BEDSS</strong>
                  </div>
                </div>
              </article>
            ))}

            {!filtered.length && (
              <div className="card">
                <h3>Henüz firma bulunmuyor</h3>
                <p className="muted">
                  Sağ üstteki Firma Ekle butonuyla ilk firma kaydını oluşturabilirsiniz.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
      <section className="card">
        <div className="section-head">
          <div className="tabs">
            {page === 'products' ? (
              <>
                <button
                  className={tab === 'stocks' ? 'active' : ''}
                  onClick={() => setTab('stocks')}
                >
                  Lokasyon Stokları
                </button>
                <button
                  className={tab === 'products' ? 'active' : ''}
                  onClick={() => setTab('products')}
                >
                  Ürün Kartları
                </button>
              </>
            ) : (
              <h2>
                {page === 'locations' ? 'Lokasyon Hiyerarşisi' : 'Kayıtlar'}{' '}
                <span className="count">{rows.length}</span>
              </h2>
            )}
          </div>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Kayıtlarda ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kayıtlarda ara…"
            />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {(page === 'businesses'
                  ? ['Firma adı', 'Vergi numarası', 'Durum', 'Oluşturulma', 'İşlem']
                  : page === 'locations'
                    ? ['Lokasyon', 'Tür', 'Depo', 'Üst lokasyon', 'Kod', '']
                    : page === 'products'
                      ? tab === 'stocks'
                        ? [
                            'Ürün / SKU',
                            'Lokasyon',
                            'Fiziki',
                            'Rezerve',
                            'Hasarlı / İade',
                            'Lot / Seri',
                            'Son sayım',
                            '',
                          ]
                        : [
                            'Ürün',
                            'SKU / Barkod',
                            'Kategori / Marka',
                            'Fiyatlar',
                            'Birimler',
                            'ABC',
                          ]
                      : page === 'users'
                        ? ['Personel', 'Rol', 'İşletme', 'Durum', 'İşlemler']
                        : ['Zaman', 'Kullanıcı', 'İşlem', 'Kayıt türü', 'Ayrıntı']
                ).map((v, i) => (
                  <th key={i}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {page === 'businesses' ? (
                    <>
                      <td>
                        <strong>{r.name}</strong>
                        <small>
                          Firma Kodu: <code>{r.code || '—'}</code>
                        </small>
                      </td>

                      <td>{r.tax_number}</td>

                      <td>
                        <span
                          className={
                            'bedss-firm-status ' +
                            (r.status === 'PASSIVE' ? 'passive' : 'active')
                          }
                        >
                          {r.status === 'PASSIVE' ? 'Pasif' : 'Aktif'}
                        </span>
                      </td>

                      <td>{date(r.created_at)}</td>

                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={async () => {
                            const nextStatus =
                              r.status === 'PASSIVE' ? 'ACTIVE' : 'PASSIVE';

                            const message =
                              nextStatus === 'PASSIVE'
                                ? `${r.name} firmasını pasife almak istediğinize emin misiniz?`
                                : `${r.name} firmasını tekrar aktifleştirmek istediğinize emin misiniz?`;

                            if (!window.confirm(message)) return;

                            try {
                              setError('');

                              await api(
                                '/businesses/' + r.id,
                                'PUT',
                                {
                                  name: r.name,
                                  legal_name: r.legal_name || '',
                                  tax_number: r.tax_number,
                                  tax_office: r.tax_office || '',
                                  phone: r.phone || '',
                                  email: r.email || '',
                                  city: r.city || '',
                                  district: r.district || '',
                                  address: r.address || '',
                                  authorized_person: r.authorized_person || '',
                                  status: nextStatus,
                                },
                              );

                              await load();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {r.status === 'PASSIVE'
                            ? 'Aktifleştir'
                            : 'Pasife Al'}
                        </button>
                      </td>
                    </>
                  ) : page === 'locations' ? (
                    <>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>
                        <Badge value={r.kind} />
                      </td>
                      <td>{r.warehouse_name}</td>
                      <td>{r.parent_name || '—'}</td>
                      <td>
                        <code>{r.code}</code>
                      </td>
                      <td>
                        {can('qr_yonet') && (
                          <button
                            className="text-button"
                            onClick={async () => {
                              try {
                                setNotice(await api('/locations/' + r.id + '/qr'));
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            QR Gör
                          </button>
                        )}
                      </td>
                    </>
                  ) : page === 'products' ? (
                    tab === 'stocks' ? (
                      <>
                        <td>
                          <strong>{r.name}</strong>
                          <small>
                            {r.sku} · {r.variant}
                          </small>
                        </td>
                        <td>
                          {r.location_name}
                          <small>{r.warehouse_name}</small>
                          {r.kind === 'QUARANTINE' && <Badge value="QUARANTINE" />}
                        </td>
                        <td
                          className={Number(r.physical) < Number(r.min_stock) ? 'warning-text' : ''}
                        >
                          {num(r.physical)}
                        </td>
                        <td>{num(r.reserved)}</td>
                        <td>
                          {num(r.damaged)} / {num(r.returned)}
                        </td>
                        <td>
                          {r.lot || '—'}
                          <small>{r.serial || '—'}</small>
                        </td>
                        <td>{r.last_count_at ? date(r.last_count_at) : 'Henüz sayılmadı'}</td>
                        <td>
                          {can('stok_duzelt') && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelected(r);
                                setModal('adjust');
                              }}
                            >
                              Düzelt
                            </button>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{r.name}</strong>
                          <small>{r.variant}</small>
                        </td>
                        <td>
                          {r.sku}
                          <small>{r.barcode}</small>
                        </td>
                        <td>
                          {r.category}
                          <small>
                            {r.brand} {r.model}
                          </small>
                        </td>
                        <td>
                          {money(r.purchase_price)} / {money(r.sale_price)}
                          <small>KDV %{r.vat}</small>
                        </td>
                        <td>
                          {(r.units || [])
                            .map((u: Row) => `${u.name}: ${num(u.multiplier)} adet`)
                            .join(' · ')}
                        </td>
                        <td>
                          <Badge value={r.abc} />
                        </td>
                      </>
                    )
                  ) : page === 'users' ? (
                    <>
                      <td>
                        <strong>{r.name}</strong>
                        <small>{r.email}</small>
                      </td>
                      <td>{roles[r.role]}</td>
                      <td>{r.business_name || 'Bağımsız / Global'}</td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                      <td>


                        {['WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR', 'GUEST'].includes(r.role) && (
                          <button
                            className="text-button"
                            data-testid="warehouse-assignment"
                            onClick={async () => {
                              try {
                                setSelected(r);
                                const assignments = await api('/users/' + r.id + '/warehouses');
                                setWarehouseAssignments(assignments);
                                setModal('warehouses');
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Depo Ata
                          </button>
                        )}

                        {r.id !== user.id && r.role !== 'SUPER_ADMIN' && (
                          <button
                            className="text-button"
                            style={{ color: '#b42318' }}
                            onClick={async () => {
                              const ok = window.confirm(
                                r.name + ' adlı personeli silmek istediğinize emin misiniz?'
                              );

                              if (!ok) return;

                              setError('');

                              try {
                                await api('/users/' + r.id, 'DELETE');
                                await load();
                                setError('');
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Sil
                          </button>
                        )}
                        {user.role === 'SUPER_ADMIN' && r.role === 'OWNER' && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelected(r);
                              setModal('permissions');
                            }}
                          >
                            Ek İzinler
                          </button>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{date(r.created_at)}</td>
                      <td>{r.actor_name || 'Sistem'}</td>
                      <td>
                        <code>{r.action}</code>
                      </td>
                      <td>{r.entity_type}</td>
                      <td className="log-details">{JSON.stringify(r.details)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty />}
        </div>
      </section>
      {modal && modal !== 'permissions' && (
        <Modal
          title={
            {
              business: 'Yeni Firma',
              warehouse: 'Yeni Depo',
              location: 'Yeni Lokasyon',
              product: 'Yeni Ürün Kartı',
              stock: 'Yeni Stok Kaydı',
              adjust: 'Stok Düzeltme',
              invite: 'Personel Daveti',
            }[modal] || ''
          }
          close={() => setModal(null)}
        >
          <DataForm
            fields={fields}
            onSubmit={async (b) => {
              if (modal === 'location') {
                b.parent_id = b.parent_id || null;

                const kindNames: Record<string, string> = {
                  ZONE: 'Bölüm',
                  RACK: 'Reyon',
                  FLOOR: 'Kat',
                  BIN: 'Hücre',
                  BUFFER: 'Kabul Alanı',
                  QUARANTINE: 'Karantina',
                };

                const requiredParent: Record<string, string> = {
                  RACK: 'ZONE',
                  FLOOR: 'RACK',
                  BIN: 'FLOOR',
                };

                const selectedWarehouse = String(b.warehouse_id || '');
                const selectedKind = String(b.kind || '');
                const selectedParentId = b.parent_id ? String(b.parent_id) : null;

                if (!selectedWarehouse) {
                  throw new Error('Önce depo seçmelisiniz.');
                }

                if (!selectedKind) {
                  throw new Error('Lokasyon türünü seçmelisiniz.');
                }

                if (['ZONE', 'BUFFER', 'QUARANTINE'].includes(selectedKind)) {
                  if (selectedParentId) {
                    throw new Error(
                      kindNames[selectedKind] + ' için üst lokasyon seçilmemelidir.',
                    );
                  }
                } else {
                  if (!selectedParentId) {
                    throw new Error(
                      kindNames[selectedKind] +
                        ' için üst lokasyon zorunludur. Beklenen üst tür: ' +
                        kindNames[requiredParent[selectedKind]] +
                        '.',
                    );
                  }

                  const parent = scopedLocations.find(
                    (l) => String(l.id) === selectedParentId,
                  );

                  if (!parent) {
                    throw new Error('Seçilen üst lokasyon bulunamadı.');
                  }

                  if (String(parent.warehouse_id) !== selectedWarehouse) {
                    throw new Error(
                      'Üst lokasyon seçilen depo ile aynı depoda olmalıdır.',
                    );
                  }

                  const expectedParentKind = requiredParent[selectedKind];

                  if (parent.kind !== expectedParentKind) {
                    throw new Error(
                      kindNames[selectedKind] +
                        ' yalnızca ' +
                        kindNames[expectedParentKind] +
                        ' altına eklenebilir.',
                    );
                  }
                }
              }

              if (modal === 'product') {
                const productBusinessId =
                  user.business_id || selectedBusinessId || null;

                if (!productBusinessId) {
                  throw new Error(
                    'Ürün eklemek için önce Firmalar ekranından bir firma seçmelisiniz.',
                  );
                }

                b.business_id = productBusinessId;
              }

              if (modal === 'invite' && b.role === 'AUDITOR') b.business_id = null;
              const r = await api('/' + endpoint, modal === 'adjust' ? 'PATCH' : 'POST', b);
              setModal(null);
              if (modal === 'invite') setNotice(r);
              await load();
            }}
          />
        </Modal>
      )}
      {modal === 'warehouses' && selected && (
        <Modal
          title={selected.name + ' - Depo Atamaları'}
          close={() => {
            setModal(null);
            setWarehouseAssignments([]);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();

              try {
                const ids = warehouseAssignments
                  .filter((w) => w.assigned)
                  .map((w) => w.id);

                await api(
                  '/users/' + selected.id + '/warehouses',
                  'PUT',
                  { warehouse_ids: ids },
                );

                setModal(null);
                setWarehouseAssignments([]);
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <p className="muted">
              Personelin çalışabileceği depoları seçin.
            </p>

            {warehouseAssignments.length ? (
              warehouseAssignments.map((w) => (
                <label className="checkbox-label" key={w.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(w.assigned)}
                    onChange={(e) => {
                      setWarehouseAssignments((current) =>
                        current.map((x) =>
                          x.id === w.id
                            ? { ...x, assigned: e.target.checked }
                            : x,
                        ),
                      );
                    }}
                  />

                  <span>
                    <strong>{w.name}</strong>
                    {w.address && <small>{w.address}</small>}
                  </span>
                </label>
              ))
            ) : (
              <Empty text="Bu firma için atanabilir depo bulunamadı." />
            )}

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setModal(null);
                  setWarehouseAssignments([]);
                }}
              >
                Vazgeç
              </button>

              <button
                type="submit"
                className="primary"
                disabled={!warehouseAssignments.length}
              >
                Depo Atamalarını Kaydet
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'permissions' && selected && (
        <Modal title="Rol İzinlerini Düzenle" close={() => setModal(null)}>
          <PermissionEditor
            selected={selected}
            save={async (b) => {
              await api('/users/' + selected.id + '/permissions', 'PUT', b);
              setModal(null);
              await load();
            }}
          />
        </Modal>
      )}
      {notice && (
        <Modal
          title={notice.image ? 'Lokasyon QR Kodu' : 'Demo Davet Bilgileri'}
          close={() => setNotice(null)}
        >
          {notice.image ? (
            <div className="qr-display">
              <img src={notice.image} alt="Lokasyon QR kodu" />
              <code>{notice.code}</code>
            </div>
          ) : (
            <>
              <div className="alert">
                {notice.message} Aşağıdaki bilgiler yalnızca bu ekranda gösterilir.
              </div>
              <label>
                Davet bağlantısı
                <input readOnly value={location.origin + notice.invite_url} />
              </label>
              <label>
                OTP kodu
                <input readOnly value={notice.otp} />
              </label>
              <a href={notice.invite_url} target="_blank" rel="noreferrer">
                Davet ekranını aç
              </a>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function PermissionEditor({ selected, save }: { selected: Row; save: (b: Row) => Promise<void> }) {
  const choices = [
    'sayim_olustur',
    'sayim_onayla',
    'stok_duzelt',
    'rapor_izle',
    'kullanici_yonet',
    'qr_yonet',
    'depo_yonet',
    'urun_yonet',
    'log_izle',
  ];
  const [enabled, setEnabled] = useState<string[]>(selected.effective_permissions || choices),
    [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save({
            permissions: [],
            denied_permissions: choices.filter((p) => !enabled.includes(p)),
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <p className="muted">
        İşaretini kaldırdığınız işlemler bu kullanıcı için sunucuda engellenir.
      </p>
      {choices.map((p) => (
        <label className="checkbox-label" key={p}>
          <input
            type="checkbox"
            checked={enabled.includes(p)}
            onChange={(e) =>
              setEnabled(e.target.checked ? [...enabled, p] : enabled.filter((v) => v !== p))
            }
          />
          {p}
        </label>
      ))}
      {error && <div className="alert error">{error}</div>}
      <button className="primary">İzinleri Kaydet</button>
    </form>
  );
}






















