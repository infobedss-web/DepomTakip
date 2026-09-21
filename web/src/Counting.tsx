import { useEffect, useState } from 'react';
import {
  Boxes,
  LogOut,
  ScanLine,
  ArrowLeftRight,
  Coffee,
  TriangleAlert,
  ChartNoAxesColumn,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { api, labels, num, roles, type Row } from './api';
import { Badge, DataForm, Empty, Modal, Scanner } from './components';
import {
  findSnapshotProduct,
  getCountSnapshot,
  saveCountSnapshot,
  type OfflineSnapshot,
} from './countSnapshot';
import {
  queueOfflineOperation,
  triggerOfflineSync,
} from './offline';
import {
  getPendingOfflineCount,
  hasPendingOfflineCountForStock,
  saveOfflinePhoto,
} from './offlineDb';
import {
  clearActiveCountState,
  getActiveCountState,
  getOfflineUser,
  saveActiveCountState,
} from './offlineSession';
export function Counting({ user, logout }: { user: Row; logout: () => Promise<void> }) {
  const [rooms, setRooms] = useState<Row[]>([]),
    [room, setRoom] = useState<Row | null>(null),
    [progress, setProgress] = useState<Row>({ entries: [], active: null }),
    [product, setProduct] = useState<Row | null>(null),
    [code, setCode] = useState(''),
    [barcode, setBarcode] = useState(''),
    [locationCode, setLocationCode] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [pendingOffline, setPendingOffline] = useState(0),
    [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  useEffect(() => {
    const refreshOfflineState = () => {
      setOnline(navigator.onLine);

      void getPendingOfflineCount()
        .then(setPendingOffline)
        .catch(() => {});
    };

    const onlineHandler = () => {
      refreshOfflineState();

      void triggerOfflineSync().finally(
        refreshOfflineState,
      );
    };

    window.addEventListener(
      'online',
      onlineHandler,
    );

    window.addEventListener(
      'offline',
      refreshOfflineState,
    );

    window.addEventListener(
      'bedss-offline-queue-change',
      refreshOfflineState,
    );

    refreshOfflineState();

  return () => {
      window.removeEventListener(
        'online',
        onlineHandler,
      );

      window.removeEventListener(
        'offline',
        refreshOfflineState,
      );

      window.removeEventListener(
        'bedss-offline-queue-change',
        refreshOfflineState,
      );
    };
  }, []);

  useEffect(() => {
    api('/rooms')
      .then(setRooms)
      .catch((e) => {
        if (navigator.onLine) {
          setError(e.message);
        }
      });
  }, []);
  useEffect(() => {
    if (navigator.onLine) {
      return;
    }

    void (async () => {
      const state =
        await getActiveCountState();

      if (!state) {
        return;
      }

      const cached =
        await getCountSnapshot(
          state.room_id,
        );

      if (!cached) {
        return;
      }

      setSnapshot(cached);

      setRoom({
        ...cached.room,
        status: 'OPEN',
        assignments:
          cached.assignments,
      });

      setProgress({
        entries: [],
        active:
          state.active,
      });

      setMessage(
        'Çevrimdışı sayım kaldığınız yerden açıldı.',
      );
    })();
  }, []);
  const refresh = async (id: string) => {
    if (navigator.onLine) {
      const nextRoom =
        await api('/rooms/' + id);

      const nextProgress =
        await api('/count/progress/' + id);

      setRoom(nextRoom);
      setProgress(nextProgress);

      await saveActiveCountState({
        room_id: id,
        active:
          nextProgress.active
            ? {
                location_id:
                  nextProgress.active.location_id,
                name:
                  nextProgress.active.name,
                code:
                  nextProgress.active.code,
              }
            : null,
      });

      try {
        const nextSnapshot =
          await api<OfflineSnapshot>(
            '/count/offline-snapshot/' + id,
          );

        await saveCountSnapshot(
          nextSnapshot,
        );

        setSnapshot(nextSnapshot);
      } catch {
        const cached =
          await getCountSnapshot(id);

        setSnapshot(cached);
      }

      return;
    }

    const cached =
      await getCountSnapshot(id);

    if (!cached) {
      throw new Error(
        'Bu sayım için cihazda çevrimdışı veri bulunmuyor. İnternet varken odayı bir kez açın.',
      );
    }

    setSnapshot(cached);

    const savedState =
      await getActiveCountState();

    if (
      savedState?.room_id === id
    ) {
      setProgress((current) => ({
        ...current,
        active:
          savedState.active,
      }));
    }

    setRoom((current) =>
      current || {
        ...cached.room,
        assignments:
          cached.assignments,
      },
    );
  };
  const activateLocation = async (
    value: string,
  ) => {
    const c = value.trim();

    if (!c) {
      throw new Error(
        'Reyon / lokasyon kodu gerekli.',
      );
    }

    if (!room) {
      throw new Error(
        'Aktif sayım odası bulunamadı.',
      );
    }

    if (navigator.onLine) {
      await api(
        '/count/location',
        'POST',
        {
          room_id: room.id,
          code: c,
        },
      );

      await refresh(room.id);
      return;
    }

    const cached =
      snapshot ||
      (await getCountSnapshot(
        room.id,
      ));

    if (!cached) {
      throw new Error(
        'Çevrimdışı sayım verisi bulunmuyor.',
      );
    }

    const assignment =
      cached.assignments.find(
        (x) =>
          x.location_code === c &&
          x.approved &&
          !x.finished_at,
      );

    const productLocation =
      cached.products.find(
        (x) =>
          x.location_code === c,
      );

    const location =
      assignment
        ? {
            location_id:
              assignment.location_id,
            name:
              assignment.location_name,
            code:
              assignment.location_code,
          }
        : productLocation
          ? {
              location_id:
                productLocation.location_id,
              name:
                productLocation.location_name,
              code:
                productLocation.location_code,
            }
          : null;

    if (!location) {
      throw new Error(
        'Bu lokasyon çevrimdışı görev kapsamınızda bulunmuyor.',
      );
    }

    setProgress((current) => ({
      ...current,
      active: location,
    }));

    await saveActiveCountState({
      room_id: room.id,
      active: location,
    });

    setLocationCode('');

    setMessage(
      `Aktif lokasyon: ${location.name}`,
    );
  };
  const run = async (fn: () => Promise<void>) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const join = async (c: string) => {
    await run(async () => {
      const r = await api('/count/join', 'POST', { code: c.trim().toUpperCase() });
      await refresh(r.id);
      setProduct(null);
    });
  };
  const scan = async (
    value: string,
    extra: Row = {},
  ) => {
    await run(async () => {
      if (navigator.onLine) {
        setProduct(
          await api(
            '/count/scan',
            'POST',
            {
              room_id: room!.id,
              barcode: value,
              ...extra,
            },
          ),
        );

        return;
      }

      const cached =
        snapshot ||
        (await getCountSnapshot(
          room!.id,
        ));

      if (!cached) {
        throw new Error(
          'Çevrimdışı ürün verisi bulunmuyor.',
        );
      }

      const p =
        findSnapshotProduct(
          cached,
          value,
          {
            lot: extra.lot,
            serial: extra.serial,
            location_code:
              extra.location_code,
          },
        );

      const offlineUser = await getOfflineUser();

      if (!offlineUser?.id) {
        throw new Error('Çevrimdışı kullanıcı oturumu bulunamadı.');
      }

      const alreadyQueued =
        await hasPendingOfflineCountForStock(
          room!.id,
          p.stock_id,
          {
            user_id: String(offlineUser.id),
            business_id:
              (offlineUser.business_id as string | null) ?? null,
          },
        );

      if (alreadyQueued) {
        throw new Error(
          'Bu ürün için cihazda bekleyen bir sayım zaten var. İnternet bağlantısı geldiğinde önce mevcut kayıt senkronize edilecek.',
        );
      }

      setProduct({
        ...p,
        offline: true,
      });

      setMessage(
        'Ürün cihazdaki çevrimdışı veriden bulundu.',
      );
    });
  };
  return (
    <div className="count-app">
      <header className="count-header">
        <div className="brand">
          <span className="brand-icon">
            <Boxes size={22} />
          </span>
          BEDSS <span className="count-label">SAHA</span>
        </div>
        <button className="icon-button" aria-label="Çıkış" onClick={() => void logout()}>
          <LogOut size={20} />
        </button>
      </header>
      <main className="count-main">
        <div className="count-greeting">
          <span className="eyebrow">{roles[user.role]}</span>
          <h1>Merhaba, {user.name.split(' ')[0]}</h1>
          <p className="muted">
            {room
              ? 'Atandığınız reyonda güvenle sayıma devam edin.'
              : 'Başlamak için sayım odasının QR kodunu tarayın.'}
          </p>
        </div>
        <div
          className={
            online
              ? 'alert success'
              : 'alert'
          }
          role="status"
        >
          {online
            ? 'Çevrimiçi'
            : 'Çevrimdışı — sayımlar cihazda saklanıyor.'}
          {pendingOffline > 0
            ? ` · Bekleyen sayım: ${pendingOffline}`
            : ''}
        </div>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="alert success">
            {message}
          </div>
        )}
        {!room ? (
          <>
            <section className="card">
              <span className="room-icon">
                <ScanLine size={28} />
              </span>
              <h2>Sayım Odasına Katıl</h2>
              <label>
                Oda kodu
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="BEDSS-…"
                />
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !code}
                  onClick={() => void join(code)}
                >
                  Odaya Gir
                </button>
                <Scanner
                  onScan={(c) => {
                    setCode(c);
                    void join(c);
                  }}
                />
              </div>
            </section>
            <h2 className="section-gap">Atandığım Odalar</h2>
            {rooms.map((r) => (
              <section className="card assigned-room" key={r.id}>
                <div className="section-head">
                  <h3>{r.name}</h3>
                  <Badge value={r.status} />
                </div>
                <p>{r.warehouse_name}</p>
                <code>{r.code}</code>
                <small>Odaya katılmak için yukarıdaki kod alanını veya kamerayı kullanın.</small>
              </section>
            ))}
            {!rooms.length && <Empty text="Henüz bir sayım odasına atanmadınız." />}
          </>
        ) : (
          <>
            <section className="card count-room">
              <div className="section-head">
                <h2>{room.name}</h2>
                <Badge value={room.status} />
              </div>
              <code>{room.code}</code>
              <div className="list-row">
                <span>Aktif reyon</span>
                <strong>{progress.active?.name || 'Henüz seçilmedi'}</strong>
              </div>
              <div className="button-row">
                <button className="text-button" onClick={() => void run(() => refresh(room.id))}>
                  Onay Durumunu Yenile
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setRoom(null);
                    setProduct(null);
                    setProgress({
                      entries: [],
                      active: null,
                    });
                    void clearActiveCountState();
                  }}
                >
                  Oda Değiştir
                </button>
              </div>
            </section>
            {!room.assignments.some((a: Row) => a.approved && !a.finished_at) ? (
              <div className="alert">
                {room.assignments.every((a: Row) => a.finished_at)
                  ? 'Bu odadaki sayımınızı bitirdiniz.'
                  : 'Odaya katıldınız. Bayi yetkilisinin başlama onayı bekleniyor.'}
              </div>
            ) : !room.assignments.some((a: Row) => a.approved && !a.finished_at && a.agreement_accepted_at) ? (
              <section className="card">
                <h2>Sayım Başlangıç Onayı</h2>
                <p>Atandığım reyonda gördüğüm fiziksel miktarı kör sayım kurallarına göre gireceğim.</p>
                <button className="primary" disabled={busy || !online} onClick={() => void run(async () => {
                  await api('/count/agreement', 'POST', {room_id: room.id, accepted: true});
                  await refresh(room.id);
                })}>Kabul Et ve Sayıma Başla</button>
              </section>
            ) : (
              <>
                <div className="blind-note">
                  <ShieldCheck size={18} />
                  <span>Kör sayım aktif. Yalnızca gördüğünüz fiziksel miktarı girin.</span>
                </div>
                {!progress.active && (
                  <section className="card">
                    <h2>Önce Reyon QR’sını Tarayın</h2>
                    <p className="muted">
                      Atandığınız reyona dokunarak giriş yapabilir veya reyon QR kodunu okutabilirsiniz.
                    </p>
                    <div className="assignment-list">
                      {room.assignments
                        .filter((a: Row) => a.approved && !a.finished_at && a.location_code)
                        .map((a: Row) => (
                          <button
                            key={`${a.id}-${a.location_code}`}
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                setLocationCode(a.location_code);
                                await activateLocation(a.location_code);
                              })
                            }
                          >
                            {a.location_name} — {a.location_code}
                          </button>
                        ))}
                    </div>
                    <p className="muted">Alternatif olarak lokasyon kodunu elle girebilirsiniz.</p>
                    <label>
                      Reyon / lokasyon kodu
                      <input
                        value={locationCode}
                        onChange={(e) => setLocationCode(e.target.value)}
                        placeholder="Lokasyon kodu"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={busy || !locationCode}
                        onClick={() =>
                          void run(async () => {
                            await activateLocation(
                              locationCode,
                            );
                          })
                        }
                      >
                        Reyona Gir
                      </button>
                      <Scanner
                        onScan={(c) => {
                          setLocationCode(c);
                          void run(async () => {
                            await activateLocation(c);
                          });
                        }}
                      />
                    </div>
                  </section>
                )}
                {progress.active && !product && (
                  <section className="card scan-card">
                    <h2>Ürün Tara</h2>
                    <p className="muted">Barkodu okutun veya SKU kodunu girin.</p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void scan(barcode);
                      }}
                    >
                      <label>
                        Barkod / SKU
                        <input
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          placeholder="Barkod okutun veya SKU girin"
                          autoFocus
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          enterKeyHint="go"
                        />
                      </label>
                      <div className="button-row">
                        <button className="primary" disabled={busy || !barcode}>
                          <ScanLine size={22} />
                          Tara
                        </button>
                        <Scanner
                          onScan={(c) => {
                            setBarcode(c);
                            void scan(c);
                          }}
                        />
                      </div>
                    </form>
                    <button className="text-button" onClick={() => setModal('lot')}>
                      Lot / seri numarasıyla tara
                    </button>
                  </section>
                )}
                {product && (
                  <section className="card product-count">
                    <span className="eyebrow">SAYILAN ÜRÜN</span>
                    {room?.count_type === 'BLIND' && (
                      <div className="alert info">
                        Kör sayım aktif · Sistem miktarı gizlidir. Fiziksel olarak gördüğünüz miktarı girin.
                      </div>
                    )}
                    <h2>{product.name}</h2>
                    <p>
                      {product.sku} · {product.barcode}
                    </p>
                    <div className="variant">
                      {product.variant} {product.lot && '· ' + product.lot}{' '}
                      {product.serial && '· ' + product.serial}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void run(async () => {
                          const photo = data.get('photo') as File;
                          let photo_id = null;
                          if (photo?.size) {
                            const f = new FormData();
                            f.set('photo', photo);
                            photo_id = (await api('/photos', 'POST', f)).id;
                          }
                          const countBody = {
                            room_id: room.id,
                            stock_id: product.stock_id,
                            quantity: Number(
                              data.get('quantity'),
                            ),
                            unit: 'Adet',
                            condition:
                              data.get('condition'),
                            note:
                              data.get('note'),
                          };

                          if (!navigator.onLine) {
                            let offline_photo_id:
                              string | undefined;

                            if (photo?.size) {
                              offline_photo_id =
                                await saveOfflinePhoto(
                                  photo,
                                );
                            }

                            await queueOfflineOperation(
                              '/count/offline-submit',
                              'POST',
                              {
                                ...countBody,
                                device_created_at:
                                  new Date().toISOString(),
                                offline_photo_id,
                              },
                            );

                            setMessage(
                              'Sayım cihazda güvenle saklandı. İnternet geldiğinde otomatik gönderilecek.',
                            );
                          } else {
                            await api(
                              '/count/submit',
                              'POST',
                              {
                                ...countBody,
                                photo_id,
                              },
                            );

                            setMessage(
                              'Sayım kaydedildi. Sıradaki ürünü tarayabilirsiniz.',
                            );
                          }
                          setProduct(null);
                          setBarcode('');
                          await refresh(room.id);
                          setMessage('Sayım kaydedildi. Sıradaki ürünü tarayabilirsiniz.');
                        });
                      }}
                    >
                      <div className="form-grid">
                        <label>
                          Fiziksel miktar
                          <input
                            className="quantity-input"
                            type="number"
                            inputMode="decimal"
                            name="quantity"
                            required
                            min="0"
                            max="1000000"
                            step="0.001"
                            autoFocus
                          />
                        </label>
                        <label>
                          Birim
                          <select name="unit">
                            {product.units.map((u: Row) => (
                              <option key={u.name}>{u.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label>
                        Ürün durumu
                        <select name="condition">
                          {['NORMAL', 'DAMAGED', 'RETURNED', 'DISPLAY', 'BROKEN'].map((v) => (
                            <option value={v} key={v}>
                              {labels[v]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Not
                        <textarea
                          name="note"
                          maxLength={2000}
                          placeholder="Gerekli açıklamaları ekleyin…"
                        />
                      </label>
                      <label>
                        Fotoğraf (isteğe bağlı)
                        <input
                          type="file"
                          name="photo"
                          accept="image/png,image/jpeg"
                          capture="environment"
                        />
                      </label>
                      <button className="primary wide big" disabled={busy}>
                        <Check size={22} />
                        Sayımı Kaydet
                      </button>
                    </form>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(async () => {
                          await api('/count/release', 'POST');
                          setProduct(null);
                        })
                      }
                    >
                      Ürün Sayımını İptal Et / Kilidi Bırak
                    </button>
                  </section>
                )}
                <div className="count-actions">
                  <button disabled={busy || !!product} onClick={() => setModal('location')}>
                    <ArrowLeftRight />
                    Reyon / Raf Değiştir
                  </button>
                  <button onClick={() => setModal('break')}>
                    <Coffee />
                    Mola Talebi
                  </button>
                  <button onClick={() => setModal('incident')}>
                    <TriangleAlert />
                    Kaza / Hasar Bildir
                  </button>
                  <button
                    onClick={() => {
                      void run(() => refresh(room.id));
                      setModal('progress');
                    }}
                  >
                    <ChartNoAxesColumn />
                    İlerlememi Gör
                  </button>
                </div>
                <button
                  className="secondary wide big"
                  disabled={!!product || busy}
                  onClick={() => setModal('finish')}
                >
                  <Check size={21} />
                  Sayımı Bitir
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void run(async () => {
                      await api('/count/release', 'POST');
                      setProduct(null);
                      setMessage('Size ait açık ürün kilidi bırakıldı.');
                    })
                  }
                >
                  Yarım kalan ürün kilidimi bırak
                </button>
              </>
            )}
          </>
        )}
        {modal === 'location' && room && (
          <Modal title="Reyon / Raf Değiştir" close={() => setModal('')}>
            <DataForm
              fields={[{ name: 'code', label: 'Reyon QR kodu' }]}
              onSubmit={async (b) => {
                await api('/count/location', 'POST', { room_id: room.id, ...b });
                await refresh(room.id);
                setModal('');
              }}
            />
            <Scanner
              onScan={(c) =>
                void run(async () => {
                  await api('/count/location', 'POST', { room_id: room.id, code: c });
                  await refresh(room.id);
                  setModal('');
                })
              }
            />
          </Modal>
        )}
        {modal === 'lot' && (
          <Modal title="Lot / Seri ile Tara" close={() => setModal('')}>
            <DataForm
              fields={[
                { name: 'barcode', label: 'Barkod / SKU', value: barcode },
                { name: 'lot', label: 'Lot no', required: false },
                { name: 'serial', label: 'Seri no', required: false },
                {
                  name: 'location_code',
                  label: 'Hücre / lokasyon kodu (gerekiyorsa)',
                  required: false,
                },
              ]}
              submit="Tara"
              onSubmit={async (b) => {
                const filters = Object.fromEntries(
                  Object.entries(b).filter(([, value]) => value !== ''),
                );
                setProduct(await api('/count/scan', 'POST', { room_id: room!.id, ...filters }));
                setModal('');
              }}
            />
          </Modal>
        )}
        {['break', 'incident'].includes(modal) && (
          <Modal
            title={modal === 'break' ? 'Mola Talebi' : 'Kaza / Hasar Bildir'}
            close={() => setModal('')}
          >
            <DataForm
              fields={[
                ...(modal === 'incident'
                  ? [
                      {
                        name: 'kind',
                        label: 'Bildirim türü',
                        options: [
                          { value: 'DAMAGE', label: 'Hasar' },
                          { value: 'ACCIDENT', label: 'Kaza' },
                        ],
                      },
                    ]
                  : []),
                { name: 'note', label: 'Açıklama' },
              ]}
              submit="Bildirimi Gönder"
              onSubmit={async (b) => {
                await api('/count/incident', 'POST', {
                  room_id: room!.id,
                  kind: modal === 'break' ? 'BREAK' : b.kind,
                  note: b.note,
                });
                setModal('');
                setMessage('Bildiriminiz kaydedildi.');
              }}
            />
          </Modal>
        )}
        {modal === 'progress' && (
          <Modal title="Sayım İlerlemem" close={() => setModal('')}>
            <p className="progress-total">
              {progress.entries.length} <small>kalem saydınız</small>
            </p>
            {progress.entries.map((e: Row) => (
              <div key={e.id} className="list-row">
                <strong>{e.name}</strong>
                <span>
                  {num(e.quantity)} {e.unit}
                </span>
                <small>
                  {e.location_name} · {labels[e.condition]}
                </small>
              </div>
            ))}
          </Modal>
        )}
        {modal === 'finish' && (
          <Modal title="Sayımınızı Bitirin" close={() => setModal('')}>
            <p>Bu odadaki sayım görevinizi tamamladığınızda yeni ürün girişi yapamazsınız.</p>
            <button
              className="primary wide"
              onClick={() =>
                void run(async () => {
                  await api('/count/finish', 'POST', { room_id: room!.id });
                  await refresh(room!.id);
                  setModal('');
                  setMessage('Sayım göreviniz tamamlandı.');
                })
              }
            >
              Sayımı Bitir
            </button>
          </Modal>
        )}
      </main>
      <footer>BEDSS · Güvenli saha sayımı</footer>
    </div>
  );
}


