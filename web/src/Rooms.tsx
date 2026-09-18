import { useEffect, useState } from 'react';
import { Plus, ClipboardCheck, ArrowUpRight, CalendarDays, Users, ArrowLeft } from 'lucide-react';
import { api, labels, date, num, money, type Row } from './api';
import { Badge, Modal, DataForm, Empty } from './components';
export function Rooms({ user }: { user: Row }) {
  const [rooms, setRooms] = useState<Row[]>([]),
    [detail, setDetail] = useState<Row | null>(null),
    [report, setReport] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [modal, setModal] = useState(''),
    [aux, setAux] = useState<Record<string, Row[]>>({}),
    [selectedWarehouse, setSelectedWarehouse] = useState(''),
    [type, setType] = useState('FULL'),
    [scope, setScope] = useState<string[]>([]),
    [entry, setEntry] = useState<Row | null>(null);
  const can = (p: string) => user.permissions.includes(p);
  const load = async () => {
    try {
      setRooms(await api('/rooms'));
      const names = can('sayim_olustur') ? ['warehouses', 'stocks', 'locations', 'users'] : [];
      setAux(
        Object.fromEntries(await Promise.all(names.map(async (n) => [n, await api('/' + n)]))),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const open = async (id: string) => {
    setError('');
    try {
      const d = await api('/rooms/' + id);
      setDetail(d);
      setReport(
        ['COMPLETED', 'APPROVED', 'REJECTED'].includes(d.status) && can('rapor_izle')
          ? await api('/rooms/' + id + '/report')
          : null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const action = async (path: string, body: Row = {}) => {
    setError('');
    try {
      await api(path, 'POST', body);
      if (detail) await open(detail.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      {detail ? (
        <>
          <button
            className="text-button back"
            onClick={() => {
              setDetail(null);
              setReport(null);
              setError('');
            }}
          >
            <ArrowLeft size={17} />
            Sayım odalarına dön
          </button>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SAYIM ODASI · {detail.code}</div>
              <h1>{detail.name}</h1>
              <p>
                {detail.warehouse_name} · {labels[detail.count_type]} · {labels[detail.method]}
              </p>
            </div>
            <Badge value={detail.status} />
          </div>
        </>
      ) : (
        <div className="page-heading">
          <div>
            <div className="eyebrow">PLANLA, SAY, DOĞRULA</div>
            <h1>Sayım Odaları</h1>
            <p>Ekibinizi organize edin, sayımları güvenle tamamlayın.</p>
          </div>
          {can('sayim_olustur') && (
            <button
              className="primary"
              onClick={() => {
                setSelectedWarehouse(aux.warehouses?.[0]?.id || '');
                setScope([]);
                setType('FULL');
                setModal('create');
              }}
            >
              <Plus size={18} />
              Sayım Odası Oluştur
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {!detail ? (
        <div className="room-grid">
          {rooms.map((r) => (
            <section className="card room-card" key={r.id}>
              <div className="section-head">
                <span className="room-icon">
                  <ClipboardCheck />
                </span>
                <Badge value={r.status} />
              </div>
              <h2>{r.name}</h2>
              <p>{r.warehouse_name}</p>
              <code>{r.code}</code>
              <div className="room-meta">
                <span>
                  <CalendarDays size={16} />
                  {date(r.starts_at)} — {date(r.ends_at)}
                </span>
                <span>
                  <Users size={16} />
                  {labels[r.method]} · {labels[r.count_type]}
                </span>
              </div>
              <div className="section-head compact">
                <span>Sayım ilerlemesi</span>
                <strong>
                  {r.counted} / {r.total}
                </strong>
              </div>
              <div className="progress">
                <span
                  style={{
                    width: `${Number(r.total) ? (Number(r.counted) / Number(r.total)) * 100 : 0}%`,
                  }}
                />
              </div>
              <button className="secondary wide" onClick={() => void open(r.id)}>
                Odayı Yönet <ArrowUpRight size={17} />
              </button>
            </section>
          ))}
          {!rooms.length && <Empty text="İlk sayım odanızı oluşturun." />}
        </div>
      ) : (
        <>
          <div className="detail-grid">
            <section className="card">
              <div className="section-head">
                <h2>Personel & Reyon Atamaları</h2>
                <div className="button-row">
                  <button className="text-button" onClick={() => void open(detail.id)}>
                    Yenile
                  </button>
                  {can('sayim_olustur') && ['DRAFT', 'OPEN'].includes(detail.status) && (
                    <button className="secondary" onClick={() => setModal('assign')}>
                      Personel Ata
                    </button>
                  )}
                </div>
              </div>
              <p className="muted">
                Personel oda koduyla katılır. Firma yetkilisi onayından sonra atandığı reyonda sayıma
                başlayabilir.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Personel</th>
                      <th>Reyon</th>
                      <th>Durum</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.assignments.map((a: Row) => (
                      <tr key={a.user_id + a.location_id}>
                        <td>
                          <strong>{a.user_name}</strong>
                          <small>{a.user_id.slice(0, 8)}</small>
                        </td>
                        <td>
                          {a.location_name}
                          <small>{a.location_code}</small>
                        </td>
                        <td>
                          {a.finished_at
                            ? 'Tamamladı'
                            : a.approved
                              ? 'Sayım onaylı'
                              : a.joined_at
                                ? 'Onay bekliyor'
                                : 'Katılım bekleniyor'}
                        </td>
                        <td>
                          {a.joined_at && !a.approved && can('sayim_onayla') && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void action('/rooms/' + detail.id + '/approve-person', {
                                  user_id: a.user_id,
                                })
                              }
                            >
                              Başlamayı Onayla
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!detail.assignments.length && <Empty />}
              </div>
            </section>
            <section className="card qr-display">
              <h2>Oda QR Kodu</h2>
              <img src={detail.qr} alt="Odaya giriş QR kodu" />
              <code>{detail.code}</code>
              <p className="muted">Personel sayım ekranından bu kodu tarar.</p>
              {can('sayim_onayla') && detail.status === 'DRAFT' && (
                <button
                  className="primary wide"
                  onClick={() => void action('/rooms/' + detail.id + '/open')}
                >
                  Odayı Sayıma Aç
                </button>
              )}
              {can('sayim_onayla') && detail.status === 'OPEN' && (
                <button
                  className="primary wide"
                  onClick={() => void action('/rooms/' + detail.id + '/complete')}
                >
                  Odayı Tamamla
                </button>
              )}
            </section>
          </div>
          {report ? (
            <>
              <div className="stats-grid report-stats">
                {[
                  [
                    'Pozitif Fark',
                    num(
                      report.rows.reduce(
                        (a: number, r: Row) => a + Math.max(Number(r.difference), 0),
                        0,
                      ),
                    ),
                  ],
                  [
                    'Negatif Fark',
                    num(
                      report.rows.reduce(
                        (a: number, r: Row) => a + Math.min(Number(r.difference), 0),
                        0,
                      ),
                    ),
                  ],
                  [
                    'Değer Farkı',
                    money(
                      report.rows.reduce((a: number, r: Row) => a + Number(r.value_difference), 0),
                    ),
                  ],
                  ['Sayılan Kalem', report.rows.length],
                ].map(([label, value]) => (
                  <div className="card stat" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <section className="card">
                <div className="section-head">
                  <h2>Sayım Fark Raporu</h2>
                  {detail.status === 'COMPLETED' && can('sayim_onayla') && (
                    <div className="button-row">
                      <button className="secondary" onClick={() => setModal('reject')}>
                        Reddet
                      </button>
                      <button className="primary" onClick={() => setModal('approve')}>
                        Onayla & Stoğa İşle
                      </button>
                    </div>
                  )}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th>Reyon</th>
                        <th>Sistem</th>
                        <th>Sayılan</th>
                        <th>Fark</th>
                        <th>Değer farkı</th>
                        <th>Durum / Not</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r: Row) => (
                        <tr key={r.stock_id}>
                          <td>
                            <strong>{r.name}</strong>
                            <small>
                              {r.sku} · {r.user_name}
                            </small>
                          </td>
                          <td>{r.location_name}</td>
                          <td>{num(r.expected)}</td>
                          <td>{num(r.counted)}</td>
                          <td
                            className={Number(r.difference) < 0 ? 'warning-text' : 'positive-text'}
                          >
                            {num(r.difference)}
                          </td>
                          <td>{money(r.value_difference)}</td>
                          <td>
                            <Badge value={r.condition} />
                            <small>{r.note}</small>
                            {r.photo_id && (
                              <a
                                className="text-button"
                                href={'/api/documents/' + r.photo_id}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Fotoğrafı İndir
                              </a>
                            )}
                          </td>
                          <td>
                            {detail.status === 'COMPLETED' && can('stok_duzelt') && (
                              <button
                                className="text-button"
                                onClick={() => {
                                  setEntry(r);
                                  setModal('correct');
                                }}
                              >
                                Düzelt
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="detail-grid section-gap">
                <section className="card">
                  <h2>Personel Performansı</h2>
                  {report.performance.map((p: Row) => (
                    <div className="list-row" key={p.name}>
                      <strong>{p.name}</strong>
                      <span>{p.counted} kalem</span>
                      <small>
                        {date(p.first_count)} — {date(p.last_count)}
                      </small>
                    </div>
                  ))}
                </section>
                <section className="card">
                  <h2>Hasar / Kaza / Mola Kayıtları</h2>
                  {report.incidents.length ? (
                    report.incidents.map((i: Row) => (
                      <div className="list-row" key={i.id}>
                        <Badge value={i.kind} />
                        <strong>{i.user_name}</strong>
                        <p>{i.note}</p>
                        <small>{date(i.created_at)}</small>
                      </div>
                    ))
                  ) : (
                    <Empty text="Bildirim bulunmuyor." />
                  )}
                </section>
              </div>
              <section className="card section-gap">
                <h2>Reyon Özeti</h2>
                {Object.entries(
                  report.rows.reduce((acc: Record<string, Row>, r: Row) => {
                    const v = acc[r.location_name] || { count: 0, diff: 0 };
                    v.count++;
                    v.diff += Number(r.difference);
                    acc[r.location_name] = v;
                    return acc;
                  }, {}),
                ).map(([name, v]) => (
                  <div className="list-row" key={name}>
                    <strong>{name}</strong>
                    <span>
                      {(v as Row).count} kalem · Fark: {num((v as Row).diff)}
                    </span>
                  </div>
                ))}
              </section>
            </>
          ) : (
            <section className="card section-gap">
              <h2>Ürün Kapsamı</h2>
              <p className="muted">Fark raporu tüm kapsam sayılıp oda tamamlandığında açılır.</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>SKU</th>
                      <th>Lokasyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((i: Row) => (
                      <tr key={i.stock_id}>
                        <td>{i.name}</td>
                        <td>{i.sku}</td>
                        <td>{i.location_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {modal === 'create' && (
        <Modal title="Yeni Sayım Odası" close={() => setModal('')}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));

              /* BEDSS ROOM SCOPE GUARD */
              if (
                !['FULL', 'BLIND'].includes(type) &&
                scope.length === 0
              ) {
                setError(
                  'Bu sayım türünde en az bir ürün / lokasyon kapsamı seçmelisiniz.',
                );
                return;
              }
              try {
                await api('/rooms', 'POST', {
                  ...b,
                  starts_at: new Date(String(b.starts_at)).toISOString(),
                  ends_at: new Date(String(b.ends_at)).toISOString(),
                  stock_ids: scope,
                });
                setModal('');
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Oda adı
                <input name="name" required minLength={3} />
              </label>
              <label>
                Depo
                <select
                  name="warehouse_id"
                  value={selectedWarehouse}
                  required
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setScope([]);
                  }}
                >
                  {aux.warehouses?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sayım türü
                <select name="count_type" value={type} onChange={(e) => setType(e.target.value)}>
                  {['FULL', 'PARTIAL', 'CYCLIC', 'RACK', 'BLIND'].map((v) => (
                    <option value={v} key={v}>
                      {labels[v]}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  {type === 'FULL'
                    ? 'Tam sayım: seçilen deponun tamamı kapsama alınır.'
                    : type === 'BLIND'
                      ? 'Kör sayım: sistem miktarı personele gösterilmez. Kapsam seçmezseniz tüm depo sayılır.'
                      : 'Bu sayım türünde aşağıdan en az bir stok kalemi seçmelisiniz.'}
                </small>
              </label>
              <label>
                Yöntem
                <select name="method">
                  {['INTERNAL', 'AUDITOR', 'HYBRID'].map((v) => (
                    <option value={v} key={v}>
                      {labels[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Başlangıç
                <input type="datetime-local" name="starts_at" required defaultValue={localDate()} />
              </label>
              <label>
                Bitiş
                <input type="datetime-local" name="ends_at" required defaultValue={localDate(7)} />
              </label>
            </div>
            {type !== 'FULL' && (
              <fieldset>
                <legend>Ürün / lokasyon kapsamı</legend>
                {aux.stocks
                  ?.filter(
                    (s) =>
                      aux.locations?.find((l) => l.id === s.location_id)?.warehouse_id ===
                      selectedWarehouse,
                  )
                  .map((s) => (
                    <label className="checkbox-label" key={s.id}>
                      <input
                        type="checkbox"
                        checked={scope.includes(s.id)}
                        onChange={(e) =>
                          setScope(
                            e.target.checked ? [...scope, s.id] : scope.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.name} · {s.location_name} · {s.lot}
                    </label>
                  ))}
              </fieldset>
            )}
            {error && <div className="alert error">{error}</div>}
            <div className="form-actions">
              <button className="primary">Odayı Oluştur</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'assign' && detail && (
        <Modal title="Personel ve Reyon Ata" close={() => setModal('')}>
          <DataForm
            fields={[
              {
                name: 'user_id',
                label: 'Personel',
                options:
                  aux.users
                    ?.filter(
                      (u) =>
                        u.status === 'ACTIVE' &&
                        ((u.role === 'COUNTER' && u.business_id === detail.business_id) ||
                          (u.role === 'AUDITOR' && user.role === 'SUPER_ADMIN')),
                    )
                    .map((u) => ({
                      value: u.id,
                      label: u.name + ' · ' + (u.role === 'AUDITOR' ? 'Bilirkişi' : 'İç personel'),
                    })) || [],
              },
              {
                name: 'location_id',
                label: 'Reyon / Lokasyon',
                options:
                  aux.locations
                    ?.filter((l) => l.warehouse_id === detail.warehouse_id)
                    .map((l) => ({ value: l.id, label: l.name })) || [],
              },
            ]}
            onSubmit={async (b) => {
              await api('/rooms/' + detail.id + '/assignments', 'POST', b);
              setModal('');
              await open(detail.id);
            }}
          />
        </Modal>
      )}
      {['approve', 'reject', 'correct'].includes(modal) && detail && (
        <Modal
          title={
            modal === 'correct'
              ? 'Sayım Kaydını Düzelt'
              : modal === 'approve'
                ? 'Farkları Stoğa İşle'
                : 'Sayımı Reddet'
          }
          close={() => setModal('')}
        >
          <p className="muted">
            {modal === 'approve'
              ? 'Onay, fiziksel miktarları sayım sonuçlarıyla günceller ve odayı kapatır.'
              : 'Gerekçeniz işlem kayıtlarına eklenecektir.'}
          </p>
          <DataForm
            fields={[
              ...(modal === 'correct'
                ? [
                    {
                      name: 'quantity',
                      label: 'Düzeltilmiş adet',
                      type: 'number',
                      value: entry?.counted,
                    },
                  ]
                : []),
              { name: 'reason', label: 'Gerekçe' },
            ]}
            onSubmit={async (b) => {
              if (modal === 'correct')
                await api('/rooms/' + detail.id + '/entries/' + entry?.entry_id, 'PATCH', b);
              else
                await api('/rooms/' + detail.id + '/review', 'POST', {
                  ...b,
                  action: modal === 'approve' ? 'APPROVE' : 'REJECT',
                });
              setModal('');
              await open(detail.id);
              await load();
            }}
          />
        </Modal>
      )}
    </>
  );
}
function localDate(days = 0) {
  const d = new Date(Date.now() + days * 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

