import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  CircleAlert,
  LogOut,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Warehouse,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Row } from './api';
import { GoodsReceipt } from './GoodsReceipt';
import { PutAway } from './PutAway';
import { InternalTransfer } from './InternalTransfer';
import { WarehouseTransfer } from './WarehouseTransfer';
import { Shipment } from './Shipment';
import { Incidents } from './Incidents';
import { Quarantine } from './Quarantine';
import { getOfflineOperations } from './offlineDb';
import { syncOfflineOperations } from './offline';

type Page =
  | 'home'
  | 'goods-receipts'
  | 'put-away'
  | 'internal-transfer'
  | 'warehouse-transfer'
  | 'shipments'
  | 'incidents'
  | 'quarantine';

const actions = [
  ['goods-receipts', 'Mal Kabul', 'Gelen ürünü barkodla kaydet', PackageCheck],
  ['put-away', 'Rafa Yerleştirme', 'Sanal raftan lokasyona taşı', Warehouse],
  ['internal-transfer', 'Depo İçi Transfer', 'Raflar arasında ürün taşı', ArrowLeftRight],
  ['warehouse-transfer', 'Depolar Arası', 'Başka depoya transfer oluştur', Boxes],
  ['shipments', 'Sevkiyat', 'Depodan ürün çıkışı yap', Send],
  ['incidents', 'Hasar / Fire', 'Hasarlı ürünü bildir', CircleAlert],
  ['quarantine', 'Karantina', 'Satışa kapalı stoğu yönet', ShieldAlert],
] as const;

export function WarehouseStaffShell({ user, logout }: { user: Row; logout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('home');
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>('');

  const scope = useMemo(
    () => ({ user_id: String(user.id), business_id: (user.business_id as string | null) ?? null }),
    [user.id, user.business_id],
  );

  const refreshQueue = async () => {
    const [p, f] = await Promise.all([
      getOfflineOperations(['PENDING', 'SYNCING'], scope),
      getOfflineOperations(['FAILED', 'CONFLICT'], scope),
    ]);
    setPending(p.length);
    setFailed(f.length);
  };

  const runSync = async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      await syncOfflineOperations();
      setLastSync(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setSyncing(false);
      await refreshQueue();
    }
  };

  useEffect(() => {
    void refreshQueue();
    const onOnline = () => {
      setOnline(true);
      void runSync();
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => void refreshQueue();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('depomtakip-offline-queue-change', onQueue);

    const timer = window.setInterval(() => {
      if (navigator.onLine) void runSync();
      else void refreshQueue();
    }, 15000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('depomtakip-offline-queue-change', onQueue);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = actions.find(([key]) => key === page)?.[1] ?? 'Depo Görevlisi';

  const content = () => {
    if (page === 'goods-receipts') return <GoodsReceipt user={user} />;
    if (page === 'put-away') return <PutAway />;
    if (page === 'internal-transfer') return <InternalTransfer />;
    if (page === 'warehouse-transfer') return <WarehouseTransfer />;
    if (page === 'shipments') return <Shipment />;
    if (page === 'incidents') return <Incidents />;
    if (page === 'quarantine') return <Quarantine />;
    return null;
  };

  if (page !== 'home') {
    return (
      <div className="warehouse-mobile-shell">
        <header className="warehouse-mobile-header">
          <button className="warehouse-back" onClick={() => setPage('home')}>‹</button>
          <div><small>DEPO GÖREVLİSİ</small><strong>{title}</strong></div>
          <span className={online ? 'warehouse-net online' : 'warehouse-net offline'}>
            {online ? <Wifi size={18} /> : <WifiOff size={18} />}
          </span>
        </header>
        <main className="warehouse-operation-content">{content()}</main>
      </div>
    );
  }

  return (
    <div className="warehouse-mobile-shell warehouse-home">
      <header className="warehouse-home-header">
        <div className="warehouse-logo-line">
          <img src="/depomtakip-logo.png" alt="DepomTakip" />
          <button aria-label="Çıkış" onClick={() => void logout()}><LogOut size={20} /></button>
        </div>
        <div className="warehouse-greeting">
          <small>DEPO GÖREVLİSİ</small>
          <h1>Merhaba, {user.name}</h1>
          <p>Günlük depo işlemlerini telefonundan hızlıca tamamla.</p>
        </div>
      </header>

      <section className={online ? 'warehouse-sync-card online' : 'warehouse-sync-card offline'}>
        <div className="warehouse-sync-icon">
          {online ? <Wifi size={25} /> : <WifiOff size={25} />}
        </div>
        <div className="warehouse-sync-copy">
          <strong>{online ? 'Online' : 'Offline Mod'}</strong>
          <span>
            {online
              ? pending
                ? `${pending} kayıt gönderilmeyi bekliyor.`
                : 'Tüm işlemler senkronize.'
              : `${pending} kayıt cihazda güvenle bekliyor.`}
          </span>
          {lastSync && <small>Son senkron: {lastSync}</small>}
        </div>
        <button disabled={!online || syncing || pending === 0} onClick={() => void runSync()}>
          <RefreshCw size={18} className={syncing ? 'spin' : ''} />
        </button>
      </section>

      {failed > 0 && (
        <div className="warehouse-sync-warning">
          <CircleAlert size={18} /> {failed} işlem kontrol bekliyor. Bağlantı açıkken tekrar senkronize edilecek.
        </div>
      )}

      <section className="warehouse-actions">
        <div className="warehouse-section-title">
          <div><small>HIZLI İŞLEMLER</small><h2>Ne yapmak istiyorsun?</h2></div>
          <Smartphone size={22} />
        </div>
        <div className="warehouse-action-grid">
          {actions.map(([key, label, description, Icon]) => (
            <button key={key} onClick={() => setPage(key)}>
              <span className="warehouse-action-icon"><Icon size={26} /></span>
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="warehouse-bottom-note">
        <Boxes size={22} />
        <div><strong>İnternet kesilirse işlem durmaz.</strong><span>Desteklenen işlemler cihazda tutulur ve bağlantı geri gelince otomatik gönderilir.</span></div>
      </section>
    </div>
  );
}
