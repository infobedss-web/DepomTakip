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


type IncidentType =
  | 'DAMAGE'
  | 'FIRE'
  | 'LOSS';


const incidentLabels:
  Record<IncidentType, string> = {
    DAMAGE: 'Hasar',
    FIRE: 'Yangın',
    LOSS: 'Kayıp',
  };


export function Incidents() {

  const [sources, setSources] =
    useState<Row[]>([]);

  const [locations, setLocations] =
    useState<Row[]>([]);

  const [history, setHistory] =
    useState<Row[]>([]);

  const [sourceId, setSourceId] =
    useState('');

  const [
    incidentType,
    setIncidentType,
  ] = useState<IncidentType>(
    'DAMAGE',
  );

  const [quantity, setQuantity] =
    useState<number>(1);

  const [
    quarantineLocationId,
    setQuarantineLocationId,
  ] = useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [file, setFile] =
    useState<File | null>(null);

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
          '/incidents/sources',
        ),

        api<Row[]>(
          '/warehouse-operation-locations',
        ),

        api<Row[]>(
          '/incidents/history',
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


      if (sourceData.length) {

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
          'Olay kayıtları alınamadı.',
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


  const quarantineLocations =
    useMemo(
      () => {

        if (!selected) {
          return [];
        }

        return locations.filter(
          (location) =>
            location.warehouse_id ===
              selected.warehouse_id &&

            location.kind ===
              'QUARANTINE',
        );

      },
      [
        locations,
        selected,
      ],
    );


  useEffect(() => {

    if (!selected) {

      setQuantity(1);
      setQuarantineLocationId('');

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


    setQuarantineLocationId(
      (current) =>
        quarantineLocations.some(
          (x) =>
            x.id === current,
        )
          ? current
          : quarantineLocations[0]
              ?.id || '',
    );

  }, [
    selected?.stock_id,
    quarantineLocations.length,
  ]);


  function fileToBase64(
    selectedFile: File,
  ): Promise<string> {

    return new Promise(
      (
        resolve,
        reject,
      ) => {

        const reader =
          new FileReader();

        reader.onload =
          () => {

            const text =
              String(
                reader.result ||
                '',
              );

            resolve(
              text.includes(',')
                ? text.split(',')[1]
                : text,
            );
          };

        reader.onerror =
          () =>
            reject(
              new Error(
                'Fotoğraf okunamadı.',
              ),
            );

        reader.readAsDataURL(
          selectedFile,
        );
      },
    );
  }


  async function uploadPhoto() {

    if (!file) {
      return null;
    }


    if (
      ![
        'image/jpeg',
        'image/png',
      ].includes(
        file.type,
      )
    ) {

      throw new Error(
        'Fotoğraf yalnızca JPEG veya PNG olabilir.',
      );
    }


    const data =
      await fileToBase64(
        file,
      );


    const uploaded =
      await api<Row>(
        '/goods-receipts/document',
        'POST',
        {
          filename:
            file.name,

          mime_type:
            file.type,

          data,
        },
      );


    return uploaded.id;
  }


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


    if (
      !quantity ||
      Number(quantity) <= 0
    ) {

      setError(
        'Miktar sıfırdan büyük olmalıdır.',
      );

      return;
    }


    if (
      incidentType !== 'LOSS' &&
      !quarantineLocationId
    ) {

      setError(
        'Hasar ve yangın için karantina lokasyonu seçmelisiniz.',
      );

      return;
    }


    setSaving(true);


    try {

      const photoId =
        await uploadPhoto();


      await api(
        '/incidents',
        'POST',
        {
          source_stock_id:
            sourceId,

          incident_type:
            incidentType,

          quantity:
            Number(quantity),

          quarantine_location_id:
            incidentType ===
              'LOSS'
              ? null
              : quarantineLocationId,

          description:
            description.trim(),

          photo_document_id:
            photoId,
        },
      );


      setSuccess(
        incidentType === 'LOSS'
          ? 'Kayıp kaydı oluşturuldu ve stoktan düşüldü.'
          : 'Olay kaydı oluşturuldu ve ürün karantinaya taşındı.',
      );


      setDescription('');
      setFile(null);


      await load();

    } catch (e: any) {

      setError(
        e.message ||
          'Olay kaydı tamamlanamadı.',
      );

    } finally {

      setSaving(false);
    }
  }


  if (loading) {

    return (
      <div className="loading">
        Hasar ve karantina ekranı yükleniyor…
      </div>
    );
  }


  return (
    <div>

      <div className="page-heading">

        <div>

          <div className="eyebrow">
            DEPO DENETİMİ
          </div>

          <h1>
            Hasar / Kayıp / Karantina
          </h1>

          <p>
            Hasarlı, yangından
            etkilenmiş veya kaybolmuş
            stokları kayıt altına alın.
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
              İşlem Yapılabilir Stoklar
            </h2>

            <p className="muted">
              Rezerve ve daha önce
              hasarlı olarak ayrılmış
              miktarlar yeniden
              kullanılamaz.
            </p>

          </div>

          <span className="badge active">
            {sources.length} stok
          </span>

        </div>


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
                <th>SKU</th>
                <th>Depo</th>
                <th>Lokasyon</th>
                <th>Lot / Seri</th>
                <th>Fiziki</th>
                <th>Rezerve</th>
                <th>Hasarlı</th>
                <th>Kullanılabilir</th>
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
                    </td>

                    <td>
                      {row.sku}
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
                Yeni Olay Bildirimi
              </h2>

              <p className="muted">
                Hasar, yangın veya
                kayıp kaydı oluşturun.
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
                      {
                        row.available_quantity
                      }
                    </option>

                  ),
                )}

              </select>

            </label>


            <label>

              Olay Türü

              <select
                aria-label="Olay Türü"
                value={
                  incidentType
                }
                onChange={(e) =>
                  setIncidentType(
                    e.target
                      .value as IncidentType,
                  )
                }
              >

                <option value="DAMAGE">
                  Hasar
                </option>

                <option value="FIRE">
                  Yangın
                </option>

                <option value="LOSS">
                  Kayıp
                </option>

              </select>

            </label>


            <label>

              Miktar

              <input
                aria-label="Olay Miktarı"
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


            {incidentType !==
              'LOSS' && (

              <label>

                Karantina Lokasyonu

                <select
                  aria-label="Karantina Lokasyonu"
                  value={
                    quarantineLocationId
                  }
                  onChange={(e) =>
                    setQuarantineLocationId(
                      e.target.value,
                    )
                  }
                  required
                >

                  <option value="">
                    Karantina seç
                  </option>

                  {quarantineLocations.map(
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
                      </option>

                    ),
                  )}

                </select>

              </label>

            )}


            <label>

              Fotoğraf

              <input
                aria-label="Olay Fotoğrafı"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) =>
                  setFile(
                    e.target.files?.[0] ||
                    null,
                  )
                }
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
              aria-label="Olay Açıklaması"
              value={
                description
              }
              onChange={(e) =>
                setDescription(
                  e.target.value,
                )
              }
              rows={4}
              placeholder="Hasarın, yangının veya kaybın ayrıntıları"
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
                  incidentLabels[
                    incidentType
                  ]
                }
              </strong>

              {' · '}

              {
                selected
                  .product_name
              }

              {' · '}

              {
                selected
                  .source_location_name
              }

              {' · '}

              Maksimum:
              {' '}

              {Number(
                selected
                  .available_quantity,
              ).toLocaleString(
                'tr-TR',
              )}

              {incidentType !==
                'LOSS' && (
                <>
                  {' · '}
                  Karantina:
                  {' '}
                  {quarantineLocations.find(
                    (x) =>
                      x.id ===
                      quarantineLocationId,
                  )?.name ||
                    'Seçilmedi'}
                </>
              )}

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
                ? 'Kaydediliyor…'
                : 'Olayı Kaydet'}

            </button>

          </div>

        </section>

      </form>


      <section className="card">

        <div className="section-head">

          <div>

            <h2>
              Olay Geçmişi
            </h2>

            <p className="muted">
              Son hasar, yangın ve
              kayıp kayıtları.
            </p>

          </div>

        </div>


        {!history.length ? (

          <p className="muted">
            Henüz olay kaydı yok.
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
                  <th>Tür</th>
                  <th>Ürün</th>
                  <th>Depo</th>
                  <th>Kaynak</th>
                  <th>Karantina</th>
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
                            incidentLabels[
                              row.incident_type as IncidentType
                            ] ||
                            row.incident_type
                          }
                        </strong>
                      </td>

                      <td>
                        {
                          row.product_name
                        }

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
                      </td>

                      <td>
                        {
                          row.quarantine_location_name ||
                          '—'
                        }
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