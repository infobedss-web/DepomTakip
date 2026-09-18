import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  api,
  type Row,
} from './api';


export function Shipment() {

  const [sources, setSources] =
    useState<Row[]>([]);

  const [history, setHistory] =
    useState<Row[]>([]);

  const [sourceId, setSourceId] =
    useState('');

  const [quantity, setQuantity] =
    useState<number>(1);

  const [customer, setCustomer] =
    useState('');

  const [
    documentNumber,
    setDocumentNumber,
  ] = useState('');

  const [note, setNote] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');


  async function load() {

    setLoading(true);
    setError('');

    try {

      const [
        sourceData,
        historyData,
      ] = await Promise.all([

        api<Row[]>(
          '/shipments/sources',
        ),

        api<Row[]>(
          '/shipments/history',
        ),
      ]);


      setSources(
        sourceData,
      );

      setHistory(
        historyData,
      );


      if (
        sourceData.length
      ) {

        setSourceId(
          (current) =>
            current &&
            sourceData.some(
              (x) =>
                x.stock_id ===
                current,
            )
              ? current
              : sourceData[0]
                  .stock_id,
        );

      } else {

        setSourceId('');
      }

    } catch (e: any) {

      setError(
        e.message ||
          'Sevkiyat verileri alınamadı.',
      );

    } finally {

      setLoading(false);
    }
  }


  useEffect(() => {
    void load();
  }, []);


  const selected =
    useMemo(
      () =>
        sources.find(
          (x) =>
            x.stock_id ===
            sourceId,
        ),
      [
        sources,
        sourceId,
      ],
    );


  useEffect(() => {

    if (!selected) {
      setQuantity(1);
      return;
    }

    const max =
      Number(
        selected
          .available_quantity,
      );

    setQuantity(
      max > 0
        ? max
        : 1,
    );

  }, [
    selected?.stock_id,
  ]);


  async function submit(
    event: FormEvent,
  ) {

    event.preventDefault();

    setError('');
    setSuccess('');


    if (!sourceId) {

      setError(
        'Sevk edilecek stok seçilmelidir.',
      );

      return;
    }


    if (
      !quantity ||
      Number(quantity) <= 0
    ) {

      setError(
        'Sevkiyat miktarı sıfırdan büyük olmalıdır.',
      );

      return;
    }


    setSaving(true);


    try {

      await api(
        '/shipments',
        'POST',
        {
          source_stock_id:
            sourceId,

          quantity:
            Number(quantity),

          customer:
            customer.trim(),

          document_number:
            documentNumber.trim(),

          note:
            note.trim(),
        },
      );


      setSuccess(
        'Mal çıkışı başarıyla tamamlandı.',
      );


      setCustomer('');
      setDocumentNumber('');
      setNote('');


      await load();

    } catch (e: any) {

      setError(
        e.message ||
          'Mal çıkışı tamamlanamadı.',
      );

    } finally {

      setSaving(false);
    }
  }


  if (loading) {

    return (
      <div className="loading">
        Sevkiyat ekranı yükleniyor…
      </div>
    );
  }


  return (
    <div>

      <div className="page-heading">

        <div>

          <div className="eyebrow">
            DEPO OPERASYONU
          </div>

          <h1>
            Sevkiyat / Mal Çıkışı
          </h1>

          <p>
            Raf stoklarından müşteri,
            şube veya sevkiyat noktasına
            ürün çıkışı gerçekleştirin.
          </p>

        </div>

      </div>


      {error && (
        <div
          role="alert"
          className="alert error"
        >
          {error}
        </div>
      )}


      {success && (
        <div className="alert">
          {success}
        </div>
      )}


      <section
        className="card"
        style={{
          marginBottom: 18,
        }}
      >

        <div className="section-head">

          <div>

            <h2>
              Sevk Edilebilir Stoklar
            </h2>

            <p className="muted">
              Rezerve ve hasarlı
              miktarlar kullanılabilir
              stoktan düşülür.
            </p>

          </div>

          <span className="badge active">
            {sources.length} stok
          </span>

        </div>


        {!sources.length ? (

          <div
            style={{
              padding: '25px 0',
            }}
          >

            <strong>
              Sevk edilebilir stok yok.
            </strong>

            <p className="muted">
              Önce Mal Kabul ve Rafa
              Yerleştirme işlemlerini
              tamamlayın.
            </p>

          </div>

        ) : (

          <div
            style={{
              overflowX: 'auto',
            }}
          >

            <table
              style={{
                width: '100%',
                minWidth: 1000,
                tableLayout:
                  'fixed',
              }}
            >

              <thead>

                <tr>
                  <th>Ürün</th>
                  <th>SKU / Barkod</th>
                  <th>Depo</th>
                  <th>Lokasyon</th>
                  <th>Lot / Seri</th>
                  <th>Fiziki</th>
                  <th>Rezerve</th>
                  <th>Hasarlı</th>
                  <th>Sevk Edilebilir</th>
                </tr>

              </thead>


              <tbody>

                {sources.map(
                  (row) => (

                    <tr
                      key={
                        row.stock_id
                      }
                      style={{
                        cursor:
                          'pointer',
                      }}
                      onClick={() =>
                        setSourceId(
                          row.stock_id,
                        )
                      }
                    >

                      <td>
                        <strong>
                          {
                            row.product_name
                          }
                        </strong>

                        {row.variant && (
                          <small>
                            {
                              row.variant
                            }
                          </small>
                        )}
                      </td>


                      <td>
                        {row.sku}

                        <small>
                          {row.barcode ||
                            '—'}
                        </small>
                      </td>


                      <td>
                        {
                          row.warehouse_name
                        }
                      </td>


                      <td>
                        {
                          row.source_location_name
                        }

                        <small>
                          {
                            row.source_location_code
                          }
                        </small>
                      </td>


                      <td>
                        {row.lot || '—'}

                        <small>
                          {row.serial ||
                            '—'}
                        </small>
                      </td>


                      <td>
                        {Number(
                          row.physical,
                        ).toLocaleString(
                          'tr-TR',
                        )}
                      </td>


                      <td>
                        {Number(
                          row.reserved,
                        ).toLocaleString(
                          'tr-TR',
                        )}
                      </td>


                      <td>
                        {Number(
                          row.damaged,
                        ).toLocaleString(
                          'tr-TR',
                        )}
                      </td>


                      <td>
                        <strong>
                          {Number(
                            row.available_quantity,
                          ).toLocaleString(
                            'tr-TR',
                          )}
                        </strong>
                      </td>

                    </tr>

                  ),
                )}

              </tbody>

            </table>

          </div>

        )}

      </section>


      <form onSubmit={submit}>

        <section
          className="card"
          style={{
            marginBottom: 18,
          }}
        >

          <div className="section-head">

            <div>

              <h2>
                Yeni Sevkiyat
              </h2>

              <p className="muted">
                Mal çıkışı bilgilerini
                girin.
              </p>

            </div>

          </div>


          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(220px,1fr))',
              gap: 14,
            }}
          >

            <label>

              Sevk Edilecek Stok

              <select
                aria-label="Sevk Edilecek Stok"
                value={sourceId}
                onChange={(e) =>
                  setSourceId(
                    e.target.value,
                  )
                }
                required
              >

                <option value="">
                  Stok seç
                </option>


                {sources.map(
                  (row) => (

                    <option
                      key={
                        row.stock_id
                      }
                      value={
                        row.stock_id
                      }
                    >
                      {
                        row.product_name
                      }
                      {' — '}
                      {
                        row.source_location_name
                      }
                      {' — '}
                      {Number(
                        row.available_quantity,
                      ).toLocaleString(
                        'tr-TR',
                      )}
                    </option>

                  ),
                )}

              </select>

            </label>


            <label>

              Miktar

              <input
                aria-label="Sevkiyat Miktarı"
                type="number"
                min="0.001"
                step="0.001"
                max={
                  selected
                    ? Number(
                        selected
                          .available_quantity,
                      )
                    : undefined
                }
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Number(
                      e.target.value,
                    ),
                  )
                }
                required
              />

            </label>


            <label>

              Müşteri / Alıcı

              <input
                aria-label="Müşteri / Alıcı"
                value={customer}
                onChange={(e) =>
                  setCustomer(
                    e.target.value,
                  )
                }
                placeholder="Örn. ABC Market"
              />

            </label>


            <label>

              İrsaliye / Belge No

              <input
                aria-label="İrsaliye / Belge No"
                value={
                  documentNumber
                }
                onChange={(e) =>
                  setDocumentNumber(
                    e.target.value,
                  )
                }
                placeholder="Örn. IRS-2026-001"
              />

            </label>

          </div>


          <label
            style={{
              display: 'block',
              marginTop: 14,
            }}
          >

            Açıklama

            <textarea
              aria-label="Sevkiyat Açıklaması"
              value={note}
              onChange={(e) =>
                setNote(
                  e.target.value,
                )
              }
              rows={3}
              placeholder="İsteğe bağlı sevkiyat notu"
            />

          </label>


          {selected && (

            <div
              className="alert"
              style={{
                marginTop: 16,
              }}
            >

              <strong>
                {
                  selected
                    .product_name
                }
              </strong>

              {' · '}

              {
                selected
                  .warehouse_name
              }

              {' · '}

              {
                selected
                  .source_location_name
              }

              {' · '}

              Kullanılabilir:
              {' '}

              {Number(
                selected
                  .available_quantity,
              ).toLocaleString(
                'tr-TR',
              )}

              {' · '}

              Lot:
              {' '}
              {selected.lot ||
                '—'}

              {' · '}

              Seri:
              {' '}
              {selected.serial ||
                '—'}

            </div>

          )}


          <div
            style={{
              display: 'flex',
              justifyContent:
                'flex-end',
              marginTop: 18,
            }}
          >

            <button
              className="primary"
              disabled={
                saving ||
                !sources.length
              }
            >

              {saving
                ? 'Çıkış yapılıyor…'
                : 'Mal Çıkışını Tamamla'}

            </button>

          </div>

        </section>

      </form>


      <section className="card">

        <div className="section-head">

          <div>

            <h2>
              Sevkiyat Geçmişi
            </h2>

            <p className="muted">
              Son gerçekleştirilen
              stok çıkışları.
            </p>

          </div>

        </div>


        {!history.length ? (

          <p className="muted">
            Henüz sevkiyat kaydı yok.
          </p>

        ) : (

          <div
            style={{
              overflowX: 'auto',
            }}
          >

            <table
              style={{
                width: '100%',
                minWidth: 1100,
                tableLayout:
                  'fixed',
              }}
            >

              <thead>

                <tr>
                  <th>Ürün</th>
                  <th>Depo</th>
                  <th>Lokasyon</th>
                  <th>Miktar</th>
                  <th>Lot / Seri</th>
                  <th>Müşteri</th>
                  <th>Belge No</th>
                  <th>Personel</th>
                  <th>Tarih</th>
                </tr>

              </thead>


              <tbody>

                {history.map(
                  (row) => (

                    <tr
                      key={row.id}
                    >

                      <td>
                        <strong>
                          {
                            row.product_name
                          }
                        </strong>

                        <small>
                          {row.sku}
                        </small>
                      </td>


                      <td>
                        {
                          row.warehouse_name
                        }
                      </td>


                      <td>
                        {
                          row.source_location_name
                        }

                        <small>
                          {
                            row.source_location_code
                          }
                        </small>
                      </td>


                      <td>
                        {Number(
                          row.quantity,
                        ).toLocaleString(
                          'tr-TR',
                        )}
                      </td>


                      <td>
                        {row.lot || '—'}

                        <small>
                          {row.serial ||
                            '—'}
                        </small>
                      </td>


                      <td>
                        {row.customer ||
                          '—'}
                      </td>


                      <td>
                        {
                          row.document_number ||
                          '—'
                        }
                      </td>


                      <td>
                        {
                          row.created_by_name
                        }
                      </td>


                      <td>
                        {new Date(
                          row.created_at,
                        ).toLocaleString(
                          'tr-TR',
                        )}
                      </td>

                    </tr>

                  ),
                )}

              </tbody>

            </table>

          </div>

        )}

      </section>

    </div>
  );
}