import { useEffect, useMemo, useState } from 'react';
import {
  EyeOff,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
  TriangleAlert,
  CheckCircle2,
} from 'lucide-react';
import type { Row } from './api';
import { Counting } from './Counting';
import { getOfflineOperations, getPendingOfflineCount } from './offlineDb';
import { triggerOfflineSync } from './offline';
import { getOfflineUser } from './offlineSession';

type SyncSummary = {
  pending: number;
  failed: number;
  conflict: number;
  syncing: number;
};

export function CounterShell({
  user,
  logout,
}: {
  user: Row;
  logout: () => Promise<void>;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [summary, setSummary] = useState<SyncSummary>({
    pending: 0,
    failed: 0,
    conflict: 0,
    syncing: 0,
  });
  const [syncing, setSyncing] = useState(false);

  const refreshQueue = async () => {
    try {
      const offlineUser = await getOfflineUser();
      const scope = offlineUser?.id
        ? {
            user_id: String(offlineUser.id),
            business_id:
              (offlineUser.business_id as string | null) ?? null,
          }
        : undefined;
      const rows = await getOfflineOperations(
        ['PENDING', 'FAILED', 'CONFLICT', 'SYNCING'],
        scope,
      );
      setSummary({
        pending: rows.filter((x) => x.status === 'PENDING').length,
        failed: rows.filter((x) => x.status === 'FAILED').length,
        conflict: rows.filter((x) => x.status === 'CONFLICT').length,
        syncing: rows.filter((x) => x.status === 'SYNCING').length,
      });
    } catch {
      setSummary((current) => current);
    }
  };

  const syncNow = async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      await triggerOfflineSync();
      await refreshQueue();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void syncNow();
    };
    const off = () => setOnline(false);
    const queue = () => void refreshQueue();

    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('depomtakip-offline-queue-change', queue);
    void refreshQueue();

    const interval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void syncNow();
      }
    }, 15_000);

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('depomtakip-offline-queue-change', queue);
      window.clearInterval(interval);
    };
  }, []);

  const totalProblem = summary.failed + summary.conflict;
  const queuedTotal = summary.pending + summary.syncing + totalProblem;
  const firstName = useMemo(
    () => String(user.name || 'Sayım Görevlisi').split(' ')[0],
    [user.name],
  );

  return (
    <div className="counter-mobile-shell">
      <header className="counter-topbar">
        <img src="/depomtakip-logo.png" alt="DepomTakip" />
        <button type="button" onClick={() => void logout()} aria-label="Çıkış yap">
          <LogOut size={20} />
        </button>
      </header>

      <section className="counter-hero">
        <span>KÖR SAYIM · TELEFON</span>
        <h1>Merhaba, {firstName}</h1>
        <p>
          Atandığınız sayımı telefonunuzdan yapın. Sistem stoğu size gösterilmez.
        </p>
      </section>

      <section className={online ? 'counter-connect online' : 'counter-connect offline'}>
        <div className="counter-connect-icon">
          {online ? <Wifi size={25} /> : <WifiOff size={25} />}
        </div>
        <div>
          <strong>{online ? 'Bağlantı aktif' : 'İnternet yok — sayım devam eder'}</strong>
          <span>
            {online
              ? queuedTotal
                ? `${queuedTotal} kayıt otomatik senkronizasyon kuyruğunda.`
                : 'Tüm sayım kayıtları güncel.'
              : `${queuedTotal} kayıt cihazda güvenle bekliyor.`}
          </span>
        </div>
        {online && queuedTotal > 0 && (
          <button type="button" onClick={() => void syncNow()} disabled={syncing}>
            <RefreshCw size={18} className={syncing ? 'spin' : ''} />
          </button>
        )}
      </section>

      <section className="counter-status-grid">
        <div>
          <Smartphone size={20} />
          <strong>{summary.pending + summary.syncing}</strong>
          <span>Bekleyen</span>
        </div>
        <div className={totalProblem ? 'warning' : ''}>
          {totalProblem ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />}
          <strong>{totalProblem}</strong>
          <span>Kontrol</span>
        </div>
        <div>
          <ShieldCheck size={20} />
          <strong>Gizli</strong>
          <span>Sistem Stoğu</span>
        </div>
      </section>

      <div className="counter-blind-banner">
        <EyeOff size={21} />
        <div>
          <strong>Kör sayım koruması aktif</strong>
          <span>Beklenen miktar ve stok bakiyesi sayım ekranında gösterilmez.</span>
        </div>
      </div>

      <main className="counter-counting-wrap">
        <Counting user={user} logout={logout} />
      </main>
    </div>
  );
}
