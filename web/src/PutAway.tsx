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


export function PutAway() {

  const [pending, setPending] =
    useState<Row[]>([]);

  const [history, setHistory] =
    useState<Row[]>([]);

  const [locations, setLocations] =
    useState<Row[]>([]);

  const [stockId, setStockId] =
    useState('');

  const [destinationId, setDestinationId] =
    useState('');

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
        pendingData,
        historyData,
        locationData,
      ] = await Promise.all([

        api<Row[]>(
          '/put-away/pending',
        ),

        api<Row[]>(
          '/put-away/history',
        ),

        api<Row[]>(
          '/warehouse-operation-locations',
        ),
      ]);

      setPending(pendingData);

      setHistory(historyData);

      setLocations(locationData);

      if (
        pendingData.length &&
        !stockId
      ) {

        setStockId(
          pendingData[0].stock_id,
        );

        setQuantity(
          Number(
            pendingData[0]
              .available_quantity,
          ),
        );
      }

    } catch (e: any) {

      setError(
        e.message ||
          'Rafa yerleştirme bilgileri alınamadı.',
      );

    } finally {

      setLoading(false);
    }
  }


  useEffect(() => {
    load();
  }, []);


  const selectedStock =
    useMemo(
      () =>
        pending.find(
          (x) =>
            x.stock_id === stockId,
        ),
      [
        pending,
        stockId,
      ],
    );


  const destinations =
    useMemo(() => {

      if (!selectedStock) {
        return [];
      }

      return locations.filter(
        (l) =>
          l.warehouse_id ===
            selectedStock.warehouse_id &&

          ['RACK', 'FLOOR', 'BIN']
            .includes(l.kind),
      );

    }, [
      locations,
      selectedStock,
    ]);


  useEffect(() => {

    if (!selectedStock) {
      setDestinationId('');
      return;
    }

    setQuantity(
      Number(
        selectedStock
          .available_quantity,
      ),
    );

    const first =
      destinations[0];

    setDestinationId(
      first?.id || '',
    );

  }, [
    stockId,
    selectedStock?.stock_id,
  ]);


  async function submit(
    e: FormEvent,
  ) {

    e.preventDefault();

    setError('');
    setSuccess('');

    if (!stockId) {

      setError(
        'Önce BUFFER ürünü seçin.',
      );

      return;
    }

    if (!destinationId) {

      setError(
        'Hedef raf / kat / hücre seçin.',
      );

      return;
    }

    if (
      !quantity ||
      quantity <= 0
    ) {

      setError(
        'Miktar sıfırdan büyük olmalıdır.',
      );

      return;
    }

    setSaving(true);

    try {

      await api(
        '/put-away',
        'POST',
        {
          source_stock_id:
            stockId,

          destination_location_id:
            destinationId,

          quantity:
            Number(quantity),
        },
      );

      setSuccess(
        'Ürün BUFFER alanından hedef lokasyona başarıyla taşındı.',
      );

      setStockId('');
      setDestinationId('');

      await load();

    } catch (e: any) {

      setError(
        e.message ||
          'Rafa yerleştirme tamamlanamadı.',
      );

    } finally {

      setSaving(false);
    }
  }


  if (loading) {

    return (
      <div className="loading">
        Rafa yerleştirme yükleniyor…
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
            Rafa Yerleştirme
          </h1>

          <p>
            Mal Kabul ile BUFFER /
            Kabul Alanına alınan ürünleri
            gerçek raf, kat veya hücre
            lokasyonlarına taşıyın.
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
              BUFFER Bekleyen Ürünler
            </h2>

            <p className="muted">
              Yerleştirilebilir normal
              stok miktarları gösterilir.
            </p>

          </div>

          <span className="badge active">
            {pending.length} stok
          </span>

        </div>


        {!pending.length ? (

          <div
            style={{
              padding: '25px 0',
            }}
          >

            <strong>
              Yerleştirilecek ürün yok.
            </strong>

            <p className="muted">
              Yeni Mal Kabul tamamlandığında
              ürünler burada görünür.
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
                minWidth: 900,
                tableLayout: 'fixed',
              }}
            >

              <thead>

                <tr>
                  <th>Ürün</th>
                  <th>SKU / Barkod</th>
                  <th>Depo</th>
                  <th>BUFFER</th>
                  <th>Lot / Seri</th>
                  <th>Kullanılabilir</th>
                </tr>

              </thead>


              <tbody>

                {pending.map(
                  (r) => (

                    <tr
                      key={
                        r.stock_id
                      }
                      style={{
                        cursor:
                          'pointer',
                      }}
                      onClick={() =>
                        setStockId(
                          r.stock_id,
                        )
                      }
                    >

                      <td>
                        <strong>
                          {r.product_name}
                        </strong>

                        {r.variant && (
                          <small>
                            {r.variant}
                          </small>
                        )}
                      </td>

                      <td>
                        {r.sku}

                        <small>
                          {r.barcode ||
                            '—'}
                        </small>
                      </td>

                      <td>
                        {r.warehouse_name}
                      </td>

                      <td>
                        {
                          r.source_location_name
                        }

                        <small>
                          {
                            r.source_location_code
                          }
                        </small>
                      </td>

                      <td>
                        {r.lot || '—'}

                        <small>
                          {r.serial ||
                            '—'}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {Number(
                            r.available_quantity,
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
                Rafa Yerleştir
              </h2>

              <p className="muted">
                BUFFER stokundan hedef
                lokasyona transfer.
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

              BUFFER Ürünü

              <select
                value={stockId}
                onChange={(e) =>
                  setStockId(
                    e.target.value,
                  )
                }
                required
              >

                <option value="">
                  Ürün seç
                </option>

                {pending.map(
                  (r) => (

                    <option
                      key={
                        r.stock_id
                      }
                      value={
                        r.stock_id
                      }
                    >
                      {r.sku}
                      {' — '}
                      {r.product_name}
                      {' — '}
                      {Number(
                        r.available_quantity,
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
                  Raf / kat / hücre seç
                </option>

                {destinations.map(
                  (l) => (

                    <option
                      key={l.id}
                      value={l.id}
                    >
                      {l.name}
                      {' — '}
                      {l.code}
                      {' — '}
                      {l.kind}
                    </option>

                  ),
                )}

              </select>

            </label>


            <label>

              Miktar

              <input
                type="number"
                min="0.001"
                step="0.001"
                max={
                  selectedStock
                    ? Number(
                        selectedStock
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


          {selectedStock && (

            <div
              style={{
                marginTop: 16,
              }}
              className="alert"
            >

              <strong>
                {
                  selectedStock
                    .product_name
                }
              </strong>

              {' · '}

              {
                selectedStock
                  .source_location_name
              }

              {' → '}

              {destinations.find(
                (x) =>
                  x.id ===
                  destinationId,
              )?.name ||
                'Hedef seçilmedi'}

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
                !pending.length
              }
            >

              {saving
                ? 'Taşınıyor…'
                : 'Rafa Yerleştir'}

            </button>

          </div>

        </section>

      </form>


      <section className="card">

        <div className="section-head">

          <div>

            <h2>
              Yerleştirme Geçmişi
            </h2>

            <p className="muted">
              BUFFER alanından yapılan son
              hareketler.
            </p>

          </div>

        </div>


        {!history.length ? (

          <p className="muted">
            Henüz rafa yerleştirme
            işlemi yok.
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
                minWidth: 900,
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
                  (r) => (

                    <tr key={r.id}>

                      <td>
                        <strong>
                          {
                            r.product_name
                          }
                        </strong>

                        <small>
                          {r.sku}
                        </small>
                      </td>

                      <td>
                        {
                          r.warehouse_name
                        }
                      </td>

                      <td>
                        {
                          r.source_location_name
                        }
                      </td>

                      <td>
                        {
                          r.destination_location_name
                        }
                      </td>

                      <td>
                        {Number(
                          r.quantity,
                        ).toLocaleString(
                          'tr-TR',
                        )}
                      </td>

                      <td>
                        {r.lot || '—'}

                        <small>
                          {r.serial ||
                            '—'}
                        </small>
                      </td>

                      <td>
                        {
                          r.created_by_name
                        }
                      </td>

                      <td>
                        {new Date(
                          r.created_at,
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