import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Smartphone,
  UserCheck,
  Users,
  Warehouse,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api, date, num, type Row } from './api';
import { Badge, Empty } from './components';

type Props = {
  navigate: (page: string) => void;
};

export function BayiControlCenter({ navigate }: Props) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await api('/bayi-control-center');
      setData(result);
      setLastRefresh(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = data?.metrics || {};
  const onlinePercent = useMemo(() => {
    const total = Number(metrics.total_devices || 0);
    return total ? Math.round((Number(metrics.online_devices || 0) / total) * 100) : 100;
  }, [metrics]);

  if (loading) return <div className="loading">Operasyon Merkezi yükleniyor…</div>;

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BAYİ YETKİLİSİ • CANLI OPERASYON</div>
          <h1>Operasyon Merkezi</h1>
          <p>Personel, sayım, cihaz ve onay bekleyen işlemleri tek ekrandan takip edin.</p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          <RefreshCw size={17} /> Yenile
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="control-center-status card">
        <div>
          <span className="live-dot" />
          <strong>Canlı izleme aktif</strong>
          <small>15 saniyede bir otomatik yenilenir.</small>
        </div>
        <div className="control-center-status-right">
          <span>{lastRefresh ? `Son güncelleme ${lastRefresh.toLocaleTimeString('tr-TR')}` : ''}</span>
          <strong className={onlinePercent === 100 ? 'success-text' : 'warning-text'}>
            Cihaz erişimi %{onlinePercent}
          </strong>
        </div>
      </div>

      <div className="stats-grid control-center-stats">
        {[
          ['Aktif Personel', metrics.active_personnel || 0, Users, `${metrics.warehouse_staff || 0} depo • ${metrics.counters || 0} sayım`],
          ['Açık Sayım', metrics.open_rooms || 0, ClipboardCheck, `${metrics.waiting_review || 0} sonuç inceleme bekliyor`],
          ['Online Cihaz', metrics.online_devices || 0, Wifi, `${metrics.offline_devices || 0} cihaz çevrimdışı`],
          ['Onaylanan Sayım', metrics.approved_rooms || 0, CheckCircle2, 'Yetkili kontrolünden geçen sayımlar'],
        ].map(([title, value, Icon, sub]) => {
          const I = Icon as typeof Users;
          return (
            <div className="stat card" key={String(title)}>
              <div className="stat-top">
                <span>{String(title)}</span>
                <span className="stat-icon"><I size={20} /></span>
              </div>
              <strong>{num(value)}</strong>
              <small>{String(sub)}</small>
            </div>
          );
        })}
      </div>

      <div className="dashboard-grid control-center-grid">
        <section className="card rooms-summary">
          <div className="section-head">
            <div>
              <h2>Canlı Sayım Operasyonları</h2>
              <p className="muted">Açık, tamamlanan ve hazırlık aşamasındaki sayımlar.</p>
            </div>
            <button className="text-button" onClick={() => navigate('rooms')}>Sayım Odaları</button>
          </div>
          {data?.live_rooms?.length ? data.live_rooms.map((room: Row) => {
            const total = Number(room.total_items || 0);
            const counted = Number(room.counted_items || 0);
            const progress = total ? Math.min(100, Math.round((counted / total) * 100)) : 0;
            return (
              <div className="summary-room" key={room.id}>
                <span className="room-icon"><ClipboardCheck size={22} /></span>
                <div className="room-info">
                  <strong>{room.name}</strong>
                  <small>{room.warehouse_name} · {room.blind_round === 2 ? '2. kör sayım' : '1. sayım'}</small>
                  <div className="progress"><span style={{ width: `${progress}%` }} /></div>
                  <small>
                    {counted}/{total} ürün · {room.joined_personnel}/{room.assigned_personnel} personel katıldı
                  </small>
                </div>
                <Badge value={room.status} />
              </div>
            );
          }) : <Empty text="Aktif veya inceleme bekleyen sayım bulunmuyor." />}
        </section>

        <section className="card quick-actions">
          <h2>Hızlı Yönetim</h2>
          <p className="muted">Bayi yetkilisinin en sık kullandığı işlemler.</p>
          {[
            ['rooms', 'Yeni / Canlı Sayım', 'Sayım oluşturun ve personel atayın', ClipboardCheck],
            ['users', 'Personel Yönetimi', 'Depo ve sayım görevlisi oluşturun', UserCheck],
            ['mobile-devices', 'Cihaz & Senkron', 'Online/offline cihazları izleyin', Smartphone],
            ['locations', 'Depo & Lokasyon', 'Depo, reyon, raf ve hücreleri yönetin', Warehouse],
          ].map(([key, title, sub, Icon]) => {
            const I = Icon as typeof Warehouse;
            return (
              <button key={String(key)} onClick={() => navigate(String(key))}>
                <span className="stat-icon"><I size={20} /></span>
                <span><strong>{String(title)}</strong><small>{String(sub)}</small></span>
              </button>
            );
          })}
        </section>

        <section className="card pending-review-card">
          <div className="section-head">
            <div>
              <h2>Sayım Farkı / İkinci Sayım</h2>
              <p className="muted">Tamamlanan kör sayımlarda yetkili kontrolü gereken farklar.</p>
            </div>
            <span className="badge pending_approval">{data?.pending_reviews?.length || 0} bekliyor</span>
          </div>
          {data?.pending_reviews?.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Sayım</th><th>Farklı Ürün</th><th>Toplam Fark</th><th>2. Sayım</th></tr></thead>
                <tbody>
                  {data.pending_reviews.map((row: Row) => (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong><small>{row.warehouse_name}</small></td>
                      <td className={Number(row.variance_items) ? 'warning-text' : 'success-text'}>{num(row.variance_items)}</td>
                      <td>{num(row.absolute_difference)}</td>
                      <td>{row.has_second_count ? <span className="badge active">Oluşturuldu</span> : <span className="badge pending_approval">Gerekebilir</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="secondary wide" onClick={() => navigate('rooms')}>Farkları İncele / İkinci Sayım Aç</button>
            </div>
          ) : <Empty text="İnceleme bekleyen sayım farkı yok." />}
        </section>

        <section className="card device-health-card">
          <div className="section-head">
            <div>
              <h2>Cihaz Sağlığı</h2>
              <p className="muted">Mobil saha erişiminin anlık özeti.</p>
            </div>
            {Number(metrics.offline_devices || 0) ? <WifiOff className="warning-text" /> : <Wifi className="success-text" />}
          </div>
          <div className="device-health-number">%{onlinePercent}</div>
          <div className="progress"><span style={{ width: `${onlinePercent}%` }} /></div>
          <p className="muted">
            {num(metrics.online_devices || 0)} online / {num(metrics.total_devices || 0)} toplam cihaz
          </p>
          {Number(metrics.offline_devices || 0) > 0 ? (
            <div className="notice warning"><AlertTriangle size={17} /> {num(metrics.offline_devices)} cihaz son 2 dakikadır merkeze ulaşmıyor.</div>
          ) : (
            <div className="notice"><CheckCircle2 size={17} /> Aktif cihazların tamamı merkeze bağlı.</div>
          )}
          <button className="secondary wide" onClick={() => navigate('mobile-devices')}>Cihazları Gör</button>
        </section>

        <section className="card recent-activity-card">
          <div className="section-head"><div><h2>Son İşlemler</h2><p className="muted">Bayi içindeki son denetlenebilir hareketler.</p></div><Activity size={20} /></div>
          {data?.recent_activity?.length ? (
            <div className="activity-list">
              {data.recent_activity.map((row: Row) => (
                <div className="activity-row" key={row.id}>
                  <span className="activity-dot" />
                  <div><strong>{row.actor_name || 'Sistem'}</strong><small>{row.action} · {row.entity_type}</small></div>
                  <time>{date(row.created_at)}</time>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </section>
      </div>
    </section>
  );
}
