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

export function WarehouseTransfer() {
  const [sources,setSources] = useState<Row[]>([]);
  const [warehouses,setWarehouses] = useState<Row[]>([]);
  const [locations,setLocations] = useState<Row[]>([]);
  const [history,setHistory] = useState<Row[]>([]);

  const [sourceId,setSourceId] = useState('');
  const [targetWarehouse,setTargetWarehouse] = useState('');
  const [targetLocation,setTargetLocation] = useState('');
  const [quantity,setQuantity] = useState<number>(1);
  const [note,setNote] = useState('');

  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [s,w,h] = await Promise.all([
        api<Row[]>('/warehouse-transfers/sources'),
        api<Row[]>('/warehouse-transfers/warehouse-operation-warehouses'),
        api<Row[]>('/warehouse-transfers/history'),
      ]);

      setSources(s || []);
      setWarehouses(w || []);
      setHistory(h || []);

      if (s?.length) {
        setSourceId(current =>
          current &&
          s.some(x => x.stock_id === current)
            ? current
            : s[0].stock_id
        );
      } else {
        setSourceId('');
      }
    } catch(e:any) {
      setError(
        e.message ||
        'Transfer verileri alÜrünamad?.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () =>
      sources.find(
        x => x.stock_id === sourceId
      ),
    [sources,sourceId]
  );

  const targets = useMemo(
    () =>
      warehouses.filter(
        w =>
          selected &&
          w.business_id === selected.business_id &&
          w.id !== selected.warehouse_id
      ),
    [
      warehouses,
      selected?.business_id,
      selected?.warehouse_id
    ]
  );

  useEffect(() => {
    if (!selected) return;

    const max =
      Number(
        selected.available_quantity || 0
      );

    setQuantity(
      max > 0 ? max : 1
    );

    setTargetWarehouse('');
    setTargetLocation('');
    setLocations([]);
  }, [selected?.stock_id]);

  useEffect(() => {
    if (!targetWarehouse) {
      setLocations([]);
      setTargetLocation('');
      return;
    }

    void api<Row[]>(
      '/warehouse-transfers/warehouse-operation-locations/' +
      targetWarehouse
    )
      .then(rows => {
        setLocations(rows || []);
        setTargetLocation(
          rows?.[0]?.id || ''
        );
      })
      .catch((e:any) => {
        setError(e.message);
      });

  }, [targetWarehouse]);

  async function submit(
    e: FormEvent
  ) {
    e.preventDefault();

    if (
      !sourceId ||
      !targetWarehouse ||
      !targetLocation
    ) {
      setError(
        'Kaynak, hedef depo ve kabul alan? se?ilmelidir.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api(
        '/warehouse-transfers',
        'POST',
        {
          source_stock_id: sourceId,
          destination_warehouse_id:
            targetWarehouse,
          destination_location_id:
            targetLocation,
          quantity:
            Number(quantity),
          note:
            note.trim(),
        }
      );

      setSuccess(
        'Transfer tasla?? olu?turuldu.'
      );

      setNote('');
      await load();

    } catch(e:any) {
      setError(
        e.message ||
        'Transfer olu?turulamad?.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function ship(id:string) {
    try {
      setError('');
      setSuccess('');

      await api(
        '/warehouse-transfers/' +
        id +
        '/ship',
        'POST',
        {}
      );

      setSuccess(
        'Transfer sevk edildi.'
      );

      await load();
    } catch(e:any) {
      setError(e.message);
    }
  }

  async function receive(
    row: Row
  ) {
    const remaining =
      Number(row.quantity) -
      Number(row.received_quantity || 0) -
      Number(row.damaged_quantity || 0);

    const normalInput =
      document.getElementById(
        'receive-normal-' + row.id
      ) as HTMLInputElement | null;

    const damagedInput =
      document.getElementById(
        'receive-damaged-' + row.id
      ) as HTMLInputElement | null;

    const normal =
      Number(normalInput?.value || remaining);

    const damaged =
      Number(damagedInput?.value || 0);

    if (
      !Number.isFinite(normal) ||
      !Number.isFinite(damaged) ||
      normal < 0 ||
      damaged < 0
    ) {
      setError('Geçerli teslim miktarı girin.');
      return;
    }

    if (normal + damaged <= 0) {
      setError('Teslim miktarı sıfır olamaz.');
      return;
    }

    if (normal + damaged > remaining) {
      setError(
        'Teslim miktarı kalan miktardan fazla olamaz.'
      );
      return;
    }

    try {
      setError('');
      setSuccess('');

      await api(
        '/warehouse-transfers/' +
        row.id +
        '/receive',
        'POST',
        {
          received_quantity: normal,
          damaged_quantity: damaged,
        }
      );

      setSuccess('Teslim kaydedildi.');

      await load();

    } catch(e:any) {
      setError(e.message);
    }
  }

  const statusLabel = (s:string) => ({
    DRAFT:'Hazırlandı',
    SHIPPED:'Sevk Edildi',
    PARTIAL:'Kısmi Teslim',
    RECEIVED:'Teslim Alındı',
    CANCELLED:'İptal',
  } as Record<string,string>)[s] || s;

  if (loading) {
    return (
      <div className="loading">
        Depolar arası transfer yükleniyor...
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

          <h1>Depolar Arası Transfer</h1>

          <p>Depolar arasında kontrollü ürün sevki ve teslim alma.</p>
        </div>
      </div>

      {error && (
        <div
          className="alert error"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div className="alert">
          {success}
        </div>
      )}

      <form onSubmit={submit}>
        <section
          className="card"
          style={{marginBottom:18}}
        >
          <h2>Yeni Transfer</h2>

          <div
            style={{
              display:'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(220px,1fr))',
              gap:14
            }}
          >

            <label>
              Kaynak Stok

              <select
                value={sourceId}
                onChange={e =>
                  setSourceId(
                    e.target.value
                  )
                }
              >
                <option value="">
                  Kaynak seç
                </option>

                {sources.map(row => (
                  <option
                    key={row.stock_id}
                    value={row.stock_id}
                  >
                    {row.product_name}
                    {' ? '}
                    {row.warehouse_name}
                    {' ? '}
                    {row.source_location_name}
                    {' ? '}
                    {Number(
                      row.available_quantity
                    ).toLocaleString('tr-TR')}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Hedef Depo

              <select
                value={targetWarehouse}
                onChange={e =>
                  setTargetWarehouse(
                    e.target.value
                  )
                }
              >
                <option value="">
                  Hedef depo seç
                </option>

                {targets.map(w => (
                  <option
                    key={w.id}
                    value={w.id}
                  >
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Hedef Kabul Alanı

              <select
                value={targetLocation}
                onChange={e =>
                  setTargetLocation(
                    e.target.value
                  )
                }
              >
                <option value="">
                  Kabul alanı seç
                </option>

                {locations.map(l => (
                  <option
                    key={l.id}
                    value={l.id}
                  >
                    {l.name}
                    {' ? '}
                    {l.code}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Miktar

              <input
                type="number"
                min="0.001"
                step="0.001"
                max={
                  selected
                  ? Number(
                      selected.available_quantity
                    )
                  : undefined
                }
                value={quantity}
                onChange={e =>
                  setQuantity(
                    Number(e.target.value)
                  )
                }
              />
            </label>

          </div>

          <label
            style={{
              display:'block',
              marginTop:14
            }}
          >
            Açıklama

            <textarea
              rows={3}
              value={note}
              onChange={e =>
                setNote(
                  e.target.value
                )
              }
            />
          </label>

          <div
            style={{
              display:'flex',
              justifyContent:'flex-end',
              marginTop:18
            }}
          >
            <button
              className="primary"
              disabled={
                saving ||
                !sourceId ||
                !targetWarehouse ||
                !targetLocation
              }
            >
              {saving
                ? 'Oluşturuluyor…'
                : 'Transfer Oluştur'}
            </button>
          </div>

        </section>
      </form>

      <section className="card">

        <h2>Transfer Geçmişi</h2>

        {!history.length ? (
          <p className="muted">
            Henüz transfer kaydı yok.
          </p>
        ) : (

          <div
            style={{
              overflowX:'auto'
            }}
          >

            <table
              style={{
                width:'100%',
                minWidth:1100
              }}
            >

              <thead>
                <tr>
                  <th>?rÜrün</th>
                  <th>Kaynak</th>
                  <th>Hedef</th>
                  <th>Miktar</th>
                  <th>Teslim</th>
                  <th>Hasarlı</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>

              <tbody>

                {history.map(row => (
                  <tr key={row.id}>

                    <td>
                      <strong>
                        {row.product_name}
                      </strong>
                      <small>
                        {row.sku}
                      </small>
                    </td>

                    <td>
                      {row.source_warehouse_name}
                      <small>
                        {row.source_location_name}
                      </small>
                    </td>

                    <td>
                      {row.destination_warehouse_name}
                      <small>
                        {row.destination_location_name}
                      </small>
                    </td>

                    <td>
                      {Number(
                        row.quantity
                      ).toLocaleString('tr-TR')}
                    </td>

                    <td>
                      {Number(
                        row.received_quantity || 0
                      ).toLocaleString('tr-TR')}
                    </td>

                    <td>
                      {Number(
                        row.damaged_quantity || 0
                      ).toLocaleString('tr-TR')}
                    </td>

                    <td>
                      {statusLabel(row.status)}
                    </td>

                    <td>

                      {row.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() =>
                            void ship(row.id)
                          }
                        >
                          Sevk Et
                        </button>
                      )}

                      {['SHIPPED','PARTIAL']
                        .includes(row.status) && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                            flexWrap: 'wrap'
                          }}
                        >
                          <input
                            id={'receive-normal-' + row.id}
                            type="number"
                            min="0"
                            step="0.001"
                            defaultValue={
                              Number(row.quantity) -
                              Number(row.received_quantity || 0) -
                              Number(row.damaged_quantity || 0)
                            }
                            placeholder="Sağlam"
                            title="Sağlam teslim miktarı"
                            style={{ width: 80 }}
                          />

                          <input
                            id={'receive-damaged-' + row.id}
                            type="number"
                            min="0"
                            step="0.001"
                            defaultValue="0"
                            placeholder="Hasarlı"
                            title="Hasarlı teslim miktarı"
                            style={{ width: 80 }}
                          />

                          <button
                            type="button"
                            className="primary"
                            onClick={() =>
                              void receive(row)
                            }
                          >
                            Teslim Al
                          </button>
                        </div>
                      )}

                    </td>

                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        )}

      </section>

    </div>
  );
}
