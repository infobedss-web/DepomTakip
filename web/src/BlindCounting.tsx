import {
  useEffect,
  useState,
} from 'react';
import {
  Plus,
  EyeOff,
  ArrowUpRight,
  ArrowLeft,
  CalendarDays,
  Users,
} from 'lucide-react';
import {
  api,
  labels,
  date,
  type Row,
} from './api';
import {
  Badge,
  Empty,
  Modal,
} from './components';

export function BlindCounting({
  user,
}: {
  user: Row;
}) {
  const [rooms, setRooms] =
    useState<Row[]>([]);

  const [detail, setDetail] =
    useState<Row | null>(null);

  const [aux, setAux] =
    useState<Record<
      string,
      Row[]
    >>({});

  const [error, setError] =
    useState('');

  const [modal, setModal] =
    useState('');

  const [
    selectedWarehouse,
    setSelectedWarehouse,
  ] = useState('');

  const [scope, setScope] =
    useState<string[]>([]);

  const [report, setReport] =
    useState<Row | null>(null);

  const [reviewReason, setReviewReason] =
    useState('');

  const [comparison, setComparison] =
    useState<Row | null>(null);

  const can = (p: string) =>
    user.permissions.includes(p);

  const load = async () => {
    setError('');

    try {
      const all =
        await api('/rooms');

      setRooms(
        all.filter(
          (r: Row) =>
            r.count_type === 'BLIND',
        ),
      );

      if (
        can('sayim_olustur')
      ) {
        const names = [
          'warehouses',
          'stocks',
          'locations',
          'users',
        ];

        setAux(
          Object.fromEntries(
            await Promise.all(
              names.map(
                async (n) => [
                  n,
                  await api(
                    '/' + n,
                  ),
                ],
              ),
            ),
          ),
        );
      }
    } catch (e) {
      setError(
        (e as Error).message,
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const open = async (
    id: string,
  ) => {
    setError('');

    try {
      const roomData =
        await api(
          '/rooms/' + id,
        );

      setDetail(roomData);

      if (
        ['COMPLETED', 'APPROVED', 'REJECTED']
          .includes(roomData.status) &&
        can('rapor_izle')
      ) {
        await loadReport(id);
        await loadComparison(id);
      } else {
        setReport(null);
      }
    } catch (e) {
      setError(
        (e as Error).message,
      );
    }
  };

  const loadComparison = async (
    id: string,
  ) => {
    try {
      setComparison(
        await api(
          '/rooms/' +
            id +
            '/blind-comparison',
        ),
      );
    } catch {
      setComparison(null);
    }
  };
  const loadReport = async (
    id: string,
  ) => {
    try {
      const data = await api(
        '/rooms/' + id + '/report',
      );

      setReport(data);
    } catch (e) {
      setReport(null);
      setError(
        (e as Error).message,
      );
    }
  };
  const action = async (
    path: string,
    body: Row = {},
  ) => {
    setError('');

    try {
      await api(
        path,
        'POST',
        body,
      );

      if (detail) {
        await open(
          detail.id,
        );
      }

      await load();
    } catch (e) {
      setError(
        (e as Error).message,
      );
    }
  };

  const warehouseStocks =
    (aux.stocks || []).filter(
      (s) =>
        (aux.locations || []).find(
          (l) =>
            l.id ===
            s.location_id,
        )?.warehouse_id ===
        selectedWarehouse,
    );

  const selectableUsers =
    (aux.users || []).filter(
      (u) =>
        [
          'COUNTER',
          'AUDITOR',
        ].includes(
          String(u.role),
        ),
    );

  return (
    <>
      {detail ? (
        <>
          <button
            className="text-button back"
            onClick={() => {
              setDetail(null);
              setError('');
            }}
          >
            <ArrowLeft size={17} />
            Kör Sayımlara dön
          </button>

          <div className="page-heading">
            <div>
              <div className="eyebrow">
                KÖR SAYIM · {detail.code}
              </div>

              <h1>
                {detail.name}
              </h1>

              <p>
                {detail.warehouse_name}
                {' · '}
                Kör Sayım
                {' · '}
                {labels[
                  detail.method
                ] ||
                  detail.method}
              </p>
            </div>

            <Badge
              value={
                detail.status
              }
            />
          </div>
        </>
      ) : (
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              BEKLENEN MİKTAR GİZLİ
            </div>

            <h1>
              Kör Sayım
            </h1>

            <p>
              Personel sistem
              miktarını görmeden
              bağımsız sayım yapar.
            </p>
          </div>

          {can(
            'sayim_olustur',
          ) && (
            <button
              className="primary"
              onClick={() => {
                setSelectedWarehouse(
                  aux.warehouses?.[0]
                    ?.id || '',
                );

                setScope([]);

                setModal(
                  'create',
                );
              }}
            >
              <Plus size={18} />
              Yeni Kör Sayım
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="alert error"
        >
          {error}
        </div>
      )}

      {!detail ? (
        <div className="room-grid">
          {rooms.map((r) => (
            <section
              className="card room-card"
              key={r.id}
            >
              <div className="section-head">
                <span className="room-icon">
                  <EyeOff />
                </span>

                <Badge
                  value={r.status}
                />
              </div>

              <h2>{r.name}</h2>

              <p>
                {r.warehouse_name}
              </p>

              <code>{r.code}</code>

              <div className="room-meta">
                <span>
                  <CalendarDays
                    size={16}
                  />
                  {date(
                    r.starts_at,
                  )}
                  {' — '}
                  {date(
                    r.ends_at,
                  )}
                </span>

                <span>
                  <Users
                    size={16}
                  />
                  Kör Sayım
                  {' · '}
                  {labels[
                    r.method
                  ] ||
                    r.method}
                </span>
              </div>

              <div className="section-head compact">
                <span>
                  Sayım ilerlemesi
                </span>

                <strong>
                  {r.counted} /{' '}
                  {r.total}
                </strong>
              </div>

              <div className="progress">
                <span
                  style={{
                    width: `${
                      Number(
                        r.total,
                      )
                        ? (Number(
                            r.counted,
                          ) /
                            Number(
                              r.total,
                            )) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>

              <button
                className="secondary wide"
                onClick={() =>
                  void open(r.id)
                }
              >
                Kör Sayımı Yönet
                <ArrowUpRight
                  size={17}
                />
              </button>
            </section>
          ))}

          {!rooms.length && (
            <Empty text="Henüz kör sayım oluşturulmadı." />
          )}
        </div>
      ) : (
        <>
          <div className="detail-grid">
            <section className="card">
              <div className="section-head">
                <div>
                  <h2>
                    Personel & Reyon
                    Atamaları
                  </h2>

                  <p className="muted">
                    Sayım görevlisi
                    beklenen miktarı
                    göremez.
                  </p>
                </div>

                {can(
                  'sayim_olustur',
                ) &&
                  [
                    'DRAFT',
                    'OPEN',
                  ].includes(
                    detail.status,
                  ) && (
                    <button
                      className="secondary"
                      onClick={() =>
                        setModal(
                          'assign',
                        )
                      }
                    >
                      Personel Ata
                    </button>
                  )}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Personel
                      </th>
                      <th>
                        Reyon
                      </th>
                      <th>
                        Durum
                      </th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {detail.assignments.map(
                      (
                        a: Row,
                      ) => (
                        <tr
                          key={
                            a.user_id +
                            a.location_id
                          }
                        >
                          <td>
                            <strong>
                              {
                                a.user_name
                              }
                            </strong>
                            <small>
                              {a.role}
                            </small>
                          </td>

                          <td>
                            {
                              a.location_name
                            }
                            <small>
                              {
                                a.location_code
                              }
                            </small>
                          </td>

                          <td>
                            {a.finished_at
                              ? 'Tamamladı'
                              : a.approved
                                ? 'Onaylı'
                                : a.joined_at
                                  ? 'Onay bekliyor'
                                  : 'Katılım bekleniyor'}
                          </td>

                          <td>
                            {a.joined_at &&
                              !a.approved &&
                              can(
                                'sayim_onayla',
                              ) && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    void action(
                                      '/rooms/' +
                                        detail.id +
                                        '/approve-person',
                                      {
                                        user_id:
                                          a.user_id,
                                      },
                                    )
                                  }
                                >
                                  Başlamayı
                                  Onayla
                                </button>
                              )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>

                {!detail.assignments
                  .length && (
                  <Empty text="Henüz personel atanmadı." />
                )}
              </div>
            </section>

            <section className="card qr-display">
              <h2>
                Kör Sayım QR
              </h2>

              <img
                src={detail.qr}
                alt="Kör sayım oda QR kodu"
              />

              <code>
                {detail.code}
              </code>

              <p className="muted">
                Personel bu kodla
                göreve katılır.
              </p>

              {can(
                'sayim_onayla',
              ) &&
                detail.status ===
                  'DRAFT' && (
                  <button
                    className="primary wide"
                    onClick={() =>
                      void action(
                        '/rooms/' +
                          detail.id +
                          '/open',
                      )
                    }
                  >
                    Kör Sayımı
                    Başlat
                  </button>
                )}

              {can(
                'sayim_onayla',
              ) &&
                detail.status ===
                  'OPEN' && (
                  <button
                    className="primary wide"
                    onClick={() =>
                      void action(
                        '/rooms/' +
                          detail.id +
                          '/complete',
                      )
                    }
                  >
                    Kör Sayımı
                    Tamamla
                  </button>
                )}
            </section>
          </div>

                    {report &&
            detail.count_type === 'BLIND' &&
            Number(
              detail.blind_round || 1,
            ) === 1 &&
            detail.status === 'COMPLETED' &&
            !comparison?.second_room &&
            can('sayim_olustur') &&
            (report.rows || []).some(
              (r: Row) =>
                Number(r.difference) !== 0,
            ) && (
              <section className="card section-gap">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">
                      KONTROLLÜ YENİDEN SAYIM
                    </div>

                    <h2>
                      İkinci Kör Sayım
                    </h2>

                    <p className="muted">
                      Yalnız fark çıkan ürünler yeni bir kör sayım
                      odasına aktarılır. İkinci görevli sistem
                      miktarını ve ilk sayım sonucunu göremez.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="primary"
                    onClick={async () => {
                      try {
                        const now =
                          new Date();

                        const end =
                          new Date(
                            now.getTime() +
                              7 *
                                86400000,
                          );

                        const second =
                          await api(
                            '/rooms/' +
                              detail.id +
                              '/second-blind',
                            'POST',
                            {
                              starts_at:
                                now.toISOString(),
                              ends_at:
                                end.toISOString(),
                            },
                          );

                        await load();
                        await open(
                          second.id,
                        );
                      } catch (e) {
                        setError(
                          (e as Error)
                            .message,
                        );
                      }
                    }}
                  >
                    İkinci Kör Sayımı Başlat
                  </button>
                </div>
              </section>
            )}

          {comparison?.second_room && (
            <section className="card section-gap">
              <div className="section-head">
                <div>
                  <div className="eyebrow">
                    KÖR SAYIM KARŞILAŞTIRMA
                  </div>

                  <h2>
                    1. ve 2. Sayım
                  </h2>

                  <p className="muted">
                    Bu tablo yalnız yetkili inceleme ekranındadır.
                  </p>
                </div>

                <Badge
                  value={
                    comparison
                      .second_room
                      .status
                  }
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Lokasyon</th>
                      <th>Sistem</th>
                      <th>1. Sayım</th>
                      <th>2. Sayım</th>
                      <th>1. Fark</th>
                      <th>2. Fark</th>
                      <th>Turlar Arası</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(comparison.rows || [])
                      .filter(
                        (r: Row) =>
                          Number(
                            r.first_difference,
                          ) !== 0,
                      )
                      .map(
                        (r: Row) => (
                          <tr
                            key={
                              r.stock_id
                            }
                          >
                            <td>
                              <strong>
                                {r.name}
                              </strong>
                              <small>
                                {r.sku}
                              </small>
                            </td>

                            <td>
                              {
                                r.location_name
                              }
                            </td>

                            <td>
                              {
                                r.system_quantity
                              }
                            </td>

                            <td>
                              {
                                r.first_count
                              }
                            </td>

                            <td>
                              {r.second_count ??
                                'Bekleniyor'}
                            </td>

                            <td>
                              {
                                r.first_difference
                              }
                            </td>

                            <td>
                              {r.second_difference ??
                                '-'}
                            </td>

                            <td>
                              {r.rounds_difference ??
                                '-'}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  void open(
                    comparison
                      .second_room
                      .id,
                  )
                }
              >
                2. Kör Sayım Odasını Aç
              </button>
            </section>
          )}
{report && (
            <section className="card section-gap">
              <div className="section-head">
                <div>
                  <div className="eyebrow">
                    YETKİLİ İNCELEME
                  </div>

                  <h2>
                    Kör Sayım Sonuçları
                  </h2>

                  <p className="muted">
                    Beklenen miktarlar yalnızca sayım tamamlandıktan
                    sonra yetkili kullanıcıya açılır.
                  </p>
                </div>

                <Badge
                  value={detail.status}
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Lokasyon</th>
                      <th>Personel</th>
                      <th>Beklenen</th>
                      <th>Sayılan</th>
                      <th>Fark</th>
                      <th>Fark %</th>
                      <th>Durum</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(report.rows || []).map(
                      (r: Row) => {
                        const expected =
                          Number(r.expected || 0);

                        const counted =
                          Number(r.counted || 0);

                        const difference =
                          Number(r.difference || 0);

                        const percent =
                          expected === 0
                            ? counted === 0
                              ? 0
                              : 100
                            : (difference /
                                expected) *
                              100;

                        return (
                          <tr key={r.entry_id}>
                            <td>
                              <strong>
                                {r.name}
                              </strong>
                              <small>
                                {r.sku}
                              </small>
                            </td>

                            <td>
                              {r.location_name}
                            </td>

                            <td>
                              {r.user_name}
                            </td>

                            <td>
                              {expected}
                            </td>

                            <td>
                              {counted}
                            </td>

                            <td>
                              <strong>
                                {difference > 0
                                  ? '+' +
                                    difference
                                  : difference}
                              </strong>
                            </td>

                            <td>
                              {percent > 0
                                ? '+'
                                : ''}
                              {percent.toFixed(2)}
                              %
                            </td>

                            <td>
                              {difference === 0
                                ? 'Eşleşti'
                                : difference < 0
                                  ? 'Eksik'
                                  : 'Fazla'}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>

              <div className="section-head section-gap">
                <div>
                  <h2>
                    Fark Özeti
                  </h2>

                  <p className="muted">
                    Onay verilmeden önce farklı ürünleri kontrol edin.
                  </p>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <span>
                    Toplam Kalem
                  </span>
                  <strong>
                    {(report.rows || []).length}
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Eşleşen
                  </span>
                  <strong>
                    {(report.rows || []).filter(
                      (r: Row) =>
                        Number(r.difference) === 0,
                    ).length}
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Eksik
                  </span>
                  <strong>
                    {(report.rows || []).filter(
                      (r: Row) =>
                        Number(r.difference) < 0,
                    ).length}
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Fazla
                  </span>
                  <strong>
                    {(report.rows || []).filter(
                      (r: Row) =>
                        Number(r.difference) > 0,
                    ).length}
                  </strong>
                </div>
              </div>

              {detail.status === 'COMPLETED' &&
                can('sayim_onayla') && (
                  <div className="section-gap">
                    <label>
                      İnceleme açıklaması
                      <textarea
                        value={reviewReason}
                        minLength={3}
                        maxLength={1000}
                        placeholder="Sayım sonucu incelendi..."
                        onChange={(e) =>
                          setReviewReason(
                            e.target.value,
                          )
                        }
                      />
                    </label>

                    <div className="form-actions">
                      <button
                        className="secondary"
                        type="button"
                        disabled={
                          reviewReason.trim()
                            .length < 3
                        }
                        onClick={async () => {
                          try {
                            await api(
                              '/rooms/' +
                                detail.id +
                                '/review',
                              'POST',
                              {
                                action:
                                  'REJECT',
                                reason:
                                  reviewReason,
                              },
                            );

                            setReviewReason('');
                            await open(
                              detail.id,
                            );

                            await load();
                          } catch (e) {
                            setError(
                              (e as Error)
                                .message,
                            );
                          }
                        }}
                      >
                        Sayımı Reddet
                      </button>

                      {!(
                        detail.count_type === 'BLIND' &&
                        Number(detail.blind_round || 1) === 1 &&
                        (report.rows || []).some(
                          (r: Row) => Number(r.difference) !== 0,
                        )
                      ) && (
                      <button
                        className="primary"
                        type="button"
                        disabled={
                          reviewReason.trim()
                            .length < 3
                        }
                        onClick={async () => {
                          try {
                            await api(
                              '/rooms/' +
                                detail.id +
                                '/review',
                              'POST',
                              {
                                action:
                                  'APPROVE',
                                reason:
                                  reviewReason,
                              },
                            );

                            setReviewReason('');
                            await open(
                              detail.id,
                            );

                            await load();
                          } catch (e) {
                            setError(
                              (e as Error)
                                .message,
                            );
                          }
                        }}
                      >
                        Onayla ve Stoku Güncelle
                      </button>
                      )}
                    </div>
                  </div>
                )}
            </section>
          )}
          <section className="card section-gap">
            <div className="section-head">
              <div>
                <h2>
                  Sayım Kapsamı
                </h2>

                <p className="muted">
                  Sistem miktarı bu
                  yönetim ekranında
                  dahi operasyon
                  sırasında
                  gösterilmez.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      Ürün
                    </th>
                    <th>
                      SKU
                    </th>
                    <th>
                      Lokasyon
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {detail.items.map(
                    (i: Row) => (
                      <tr
                        key={
                          i.stock_id
                        }
                      >
                        <td>
                          {i.name}
                        </td>
                        <td>
                          {i.sku}
                        </td>
                        <td>
                          {
                            i.location_name
                          }
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {modal ===
        'create' && (
        <Modal
          title="Yeni Kör Sayım"
          close={() =>
            setModal('')
          }
        >
          <form
            onSubmit={async (
              e,
            ) => {
              e.preventDefault();

              const b =
                Object.fromEntries(
                  new FormData(
                    e.currentTarget,
                  ),
                );

              try {
                await api(
                  '/rooms',
                  'POST',
                  {
                    ...b,
                    count_type:
                      'BLIND',
                    starts_at:
                      new Date(
                        String(
                          b.starts_at,
                        ),
                      ).toISOString(),
                    ends_at:
                      new Date(
                        String(
                          b.ends_at,
                        ),
                      ).toISOString(),
                    stock_ids:
                      scope,
                  },
                );

                setModal('');
                await load();
              } catch (e) {
                setError(
                  (
                    e as Error
                  ).message,
                );
              }
            }}
          >
            <div className="form-grid">
              <label>
                Sayım adı
                <input
                  name="name"
                  required
                  minLength={3}
                  placeholder="Eylül Kör Sayımı"
                />
              </label>

              <label>
                Depo
                <select
                  name="warehouse_id"
                  value={
                    selectedWarehouse
                  }
                  required
                  onChange={(
                    e,
                  ) => {
                    setSelectedWarehouse(
                      e.target
                        .value,
                    );

                    setScope([]);
                  }}
                >
                  {aux.warehouses?.map(
                    (w) => (
                      <option
                        key={w.id}
                        value={w.id}
                      >
                        {w.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Yöntem
                <select
                  name="method"
                >
                  {[
                    'INTERNAL',
                    'AUDITOR',
                    'HYBRID',
                  ].map((v) => (
                    <option
                      value={v}
                      key={v}
                    >
                      {labels[v] ||
                        v}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Başlangıç
                <input
                  type="datetime-local"
                  name="starts_at"
                  required
                  defaultValue={localDate()}
                />
              </label>

              <label>
                Bitiş
                <input
                  type="datetime-local"
                  name="ends_at"
                  required
                  defaultValue={localDate(
                    7,
                  )}
                />
              </label>
            </div>

            <fieldset>
              <legend>
                Ürün kapsamı
              </legend>

              <p className="muted">
                Seçim yapmazsanız
                tüm depo kör sayıma
                alınır.
              </p>

              {warehouseStocks.map(
                (s) => (
                  <label
                    className="checkbox-label"
                    key={s.id}
                  >
                    <input
                      type="checkbox"
                      checked={scope.includes(
                        s.id,
                      )}
                      onChange={(
                        e,
                      ) =>
                        setScope(
                          e.target
                            .checked
                            ? [
                                ...scope,
                                s.id,
                              ]
                            : scope.filter(
                                (
                                  id,
                                ) =>
                                  id !==
                                  s.id,
                              ),
                        )
                      }
                    />

                    {s.name}
                    {' · '}
                    {
                      s.location_name
                    }
                    {' · '}
                    {s.lot || '-'}
                  </label>
                ),
              )}
            </fieldset>

            {error && (
              <div className="alert error">
                {error}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setModal('')
                }
              >
                Vazgeç
              </button>

              <button
                type="submit"
                className="primary"
              >
                Kör Sayım
                Oluştur
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal ===
        'assign' &&
        detail && (
          <Modal
            title="Kör Sayım Personeli Ata"
            close={() =>
              setModal('')
            }
          >
            <form
              onSubmit={async (
                e,
              ) => {
                e.preventDefault();

                const b =
                  Object.fromEntries(
                    new FormData(
                      e.currentTarget,
                    ),
                  );

                try {
                  await api(
                    '/rooms/' +
                      detail.id +
                      '/assignments',
                    'POST',
                    b,
                  );

                  setModal('');
                  await open(
                    detail.id,
                  );

                  await load();
                } catch (e) {
                  setError(
                    (
                      e as Error
                    ).message,
                  );
                }
              }}
            >
              <div className="form-grid">
                <label>
                  Personel
                  <select
                    name="user_id"
                    required
                  >
                    {selectableUsers.map(
                      (u) => (
                        <option
                          value={u.id}
                          key={u.id}
                        >
                          {u.name}
                          {' · '}
                          {u.role}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Reyon / Lokasyon
                  <select
                    name="location_id"
                    required
                  >
                    {(
                      aux.locations ||
                      []
                    )
                      .filter(
                        (l) =>
                          l.warehouse_id ===
                          detail.warehouse_id,
                      )
                      .map(
                        (l) => (
                          <option
                            value={
                              l.id
                            }
                            key={
                              l.id
                            }
                          >
                            {
                              l.name
                            }
                            {' · '}
                            {
                              l.code
                            }
                          </option>
                        ),
                      )}
                  </select>
                </label>
              </div>

              {error && (
                <div className="alert error">
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setModal('')
                  }
                >
                  Vazgeç
                </button>

                <button
                  type="submit"
                  className="primary"
                >
                  Personeli Ata
                </button>
              </div>
            </form>
          </Modal>
        )}
    </>
  );
}

function localDate(
  days = 0,
) {
  const d =
    new Date(
      Date.now() +
        days * 86400000,
    );

  d.setMinutes(
    d.getMinutes() -
      d.getTimezoneOffset(),
  );

  return d
    .toISOString()
    .slice(0, 16);
}