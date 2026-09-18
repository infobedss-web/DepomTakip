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


export function InternalTransfer() {

  const [sources, setSources] =
    useState<Row[]>([]);

  const [locations, setLocations] =
    useState<Row[]>([]);

  const [history, setHistory] =
    useState<Row[]>([]);

  const [sourceId, setSourceId] =
    useState('');

  const [
    destinationId,
    setDestinationId,
  ] = useState('');

  const [quantity, setQuantity] =
    useState<number>(1);

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
        locationData,
        historyData,
      ] = await Promise.all([

        api<Row[]>(
          '/internal-transfers/sources',
        ),

        api<Row[]>(
          '/warehouse-operation-locations',
        ),

        api<Row[]>(
          '/internal-transfers/history',
        ),
      ]);


      setSources(
        sourceData,
      );

      setLocations(
        locationData,
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
        setDestinationId('');
      }

    } catch (e: any) {

      setError(
        e.message ||
          'Transfer verileri alınamadı.',
      );

    } finally {

      setLoading(false);
    }
  }


  useEffect(() => {
    void load();
  }, []);


  const selectedSource =
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


  const destinations =
    useMemo(
      () => {

        if (!selectedSource) {
          return [];
        }

        return locations.filter(
          (location) =>
            location.warehouse_id ===
              selectedSource
                .warehouse_id &&

            location.id !==
              selectedSource
                .source_location_id &&

            [
              'RACK',
              'FLOOR',
              'BIN',
            ].includes(
              location.kind,
            ),
        );

      },
      [
        locations,
        selectedSource,
      ],
    );


  useEffect(() => {

    if (!selectedSource) {

      setDestinationId('');
      setQuantity(1);

      return;
    }


    const max =
      Number(
        selectedSource
          .available_quantity,
      );


    setQuantity(
      max > 0
        ? max
        : 1,
    );


    setDestinationId(
      (current) =>
        destinations.some(
          (x) =>
            x.id === current,
        )
          ? current
          : destinations[0]
              ?.id || '',
    );

  }, [
    sourceId,
    selectedSource
      ?.stock_id,
    destinations.length,
  ]);


  async function submit(
    event: FormEvent,
  ) {

    event.preventDefault();

    setError('');
    setSuccess('');


    if (!sourceId) {

      setError(
        'Kaynak stok seçmelisiniz.',
      );

      return;
    }


    if (!destinationId) {

      setError(
        'Hedef lokasyon seçmelisiniz.',
      );

      return;
    }


    if (
      !quantity ||
      Number(quantity) <= 0
    ) {

      setError(
        'Transfer miktarı sıfırdan büyük olmalıdır.',
      );

      return;
    }


    setSaving(true);


    try {

      await api(
        '/internal-transfers',
        'POST',
        {
          source_stock_id:
            sourceId,

          destination_location_id:
            destinationId,

          quantity:
            Number(quantity),
        },
      );


      setSuccess(
        'Depo içi transfer başarıyla tamamlandı.',
      );


      await load();

    } catch (e: any) {

      setError(
        e.message ||
          'Transfer tamamlanamadı.',
      );

    } finally {

      setSaving(false);
    }
  }


  if (loading) {

    return (
      <div className="loading">
        Depo içi transfer yükleniyor…
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
            Depo İçi Transfer
          </h1>

          <p>
            Raf, kat ve hücre
            stoklarını aynı depo
            içerisindeki başka bir
            lokasyona taşıyın.
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
              Taşınabilir Stoklar
            </h2>

            <p className="muted">
              Rezerve ve hasarlı
              miktarlar transfer
              edilemez.
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
              Transfer edilebilir
              stok bulunamadı.
            </strong>

            <p className="muted">
              Önce ürünü rafa
              yerleştirin.
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
                minWidth: 980,
                tableLayout:
                  'fixed',
              }}
            >

              <thead>

                <tr>
                  <th>Ürün</th>
                  <th>SKU / Barkod</th>
                  <th>Depo</th>
                  <th>Kaynak</th>
                  <th>Lot / Seri</th>
                  <th>Fiziki</th>
                  <th>Rezerve</th>
                  <th>Hasarlı</th>
                  <th>Taşınabilir</th>
                </tr>

              </thead>


              <tbody>

                {sources.map(
                  (row) => (

                    <tr
                      key={
                        row.stock_id
                      }
                      onClick={() =>
                        setSourceId(
                          row.stock_id,
                        )
                      }
                      style={{
                        cursor:
                          'pointer',
                      }}
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
                Yeni Transfer
              </h2>

              <p className="muted">
                Kaynak stoktan hedef
                lokasyona miktar
                aktarın.
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

              Kaynak Stok

              <select
                aria-label="Kaynak Stok"
                value={sourceId}
                onChange={(e) =>
                  setSourceId(
                    e.target.value,
                  )
                }
                required
              >

                <option value="">
                  Kaynak seç
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

              Hedef Lokasyon

              <select
                aria-label="Hedef Lokasyon"
                value={
                  destinationId
                }
                onChange={(e) =>
                  setDestinationId(
                    e.target.value,
                  )
                }
                required
              >

                <option value="">
                  Hedef seç
                </option>


                {destinations.map(
                  (location) => (

                    <option
                      key={
                        location.id
                      }
                      value={
                        location.id
                      }
                    >
                      {
                        location.name
                      }
                      {' — '}
                      {
                        location.code
                      }
                      {' — '}
                      {
                        location.kind
                      }
                    </option>

                  ),
                )}

              </select>

            </label>


            <label>

              Transfer Miktarı

              <input
                aria-label="Transfer Miktarı"
                type="number"
                min="0.001"
                step="0.001"
                max={
                  selectedSource
                    ? Number(
                        selectedSource
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

          </div>


          {selectedSource && (

            <div
              className="alert"
              style={{
                marginTop: 16,
              }}
            >

              <strong>
                {
                  selectedSource
                    .product_name
                }
              </strong>

              {' · '}

              {
                selectedSource
                  .source_location_name
              }

              {' → '}

              {destinations.find(
                (x) =>
                  x.id ===
                  destinationId,
              )?.name ||
                'Hedef seçilmedi'}

              {' · '}

              Lot:
              {' '}
              {selectedSource.lot ||
                '—'}

              {' · '}

              Seri:
              {' '}
              {selectedSource.serial ||
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
                !sources.length ||
                !destinationId
              }
            >

              {saving
                ? 'Transfer ediliyor…'
                : 'Transferi Tamamla'}

            </button>

          </div>

        </section>

      </form>


      <section className="card">

        <div className="section-head">

          <div>

            <h2>
              Transfer Geçmişi
            </h2>

            <p className="muted">
              Depo içindeki son
              lokasyon transferleri.
            </p>

          </div>

        </div>


        {!history.length ? (

          <p className="muted">
            Henüz depo içi transfer
            kaydı yok.
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
                minWidth: 1000,
                tableLayout:
                  'fixed',
              }}
            >

              <thead>

                <tr>
                  <th>Ürün</th>
                  <th>Depo</th>
                  <th>Kaynak</th>
                  <th>Hedef</th>
                  <th>Miktar</th>
                  <th>Lot / Seri</th>
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
                        {
                          row.destination_location_name
                        }

                        <small>
                          {
                            row.destination_location_code
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