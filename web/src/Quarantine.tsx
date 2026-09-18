import { useEffect, useMemo, useState } from 'react';

type Source = {
  id: string;
  product_id: string;
  location_id: string;
  warehouse_id: string;
  physical: number | string;
  damaged: number | string;
  lot: string;
  serial: string;
  sku: string;
  barcode: string;
  product_name: string;
  location_code: string;
  location_name: string;
  warehouse_name: string;
};

type Location = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  kind: string;
};

type History = {
  id: string;
  action_type: 'RELEASE' | 'DISPOSE' | 'RETURN';
  quantity: number | string;
  product_name: string;
  sku: string;
  warehouse_name: string;
  source_location_code: string;
  destination_location_code?: string | null;
  lot: string;
  serial: string;
  reason: string;
  created_by_name: string;
  created_at: string;
};

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message ??
        `HTTP ${response.status}`,
    );
  }

  return data;
}

export function Quarantine() {
  const [sources, setSources] = useState<Source[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [history, setHistory] = useState<History[]>([]);

  const [sourceId, setSourceId] = useState('');
  const [actionType, setActionType] =
    useState<'RELEASE' | 'DISPOSE' | 'RETURN'>('RELEASE');

  const [quantity, setQuantity] = useState('1');
  const [destinationId, setDestinationId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selected = sources.find(
    (item) => item.id === sourceId,
  );

  const targets = useMemo(() => {
    if (!selected) return [];

    return locations.filter(
      (location) =>
        location.warehouse_id === selected.warehouse_id &&
        ['RACK', 'FLOOR', 'BIN'].includes(location.kind),
    );
  }, [locations, selected]);

  async function load() {
    const [sourceRows, locationRows, historyRows] =
      await Promise.all([
        request<Source[]>('/quarantine/sources'),
        request<Location[]>('/warehouse-operation-locations'),
        request<History[]>('/quarantine/history'),
      ]);

    setSources(sourceRows);
    setLocations(locationRows);
    setHistory(historyRows);

    if (
      sourceId &&
      !sourceRows.some((row) => row.id === sourceId)
    ) {
      setSourceId('');
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    setError('');
    setSuccess('');

    if (!sourceId) {
      setError('Karantina stogu secin.');
      return;
    }

    if (
      actionType === 'RELEASE' &&
      !destinationId
    ) {
      setError('Serbest birakma icin hedef lokasyon secin.');
      return;
    }

    setBusy(true);

    try {
      await request('/quarantine/actions', {
        method: 'POST',
        body: JSON.stringify({
          source_stock_id: sourceId,
          action_type: actionType,
          quantity: Number(quantity),
          destination_location_id:
            actionType === 'RELEASE'
              ? destinationId
              : null,
          reason,
          note,
        }),
      });

      setSuccess('Karantina islemi tamamlandi.');

      setSourceId('');
      setDestinationId('');
      setQuantity('1');
      setReason('');
      setNote('');

      await load();

    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Islem basarisiz.',
      );

    } finally {
      setBusy(false);
    }
  }

  const actionName = (value: string) => {
    if (value === 'RELEASE') return 'Serbest Birakma';
    if (value === 'DISPOSE') return 'Imha';
    if (value === 'RETURN') return 'Tedarikciye Iade';
    return value;
  };

  return (
    <section className="management-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            STOK KALITE YONETIMI
          </div>

          <h1>Karantina Yönetimi</h1>

          <p>
            Karantinadaki ürünleri serbest bırakın,
            imha edin veya tedarikçiye iade edin.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert success">
          {success}
        </div>
      )}

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Yeni Karantina İşlemi</h2>
            <p>
              İşlem stok hareketi ve denetim kaydı oluşturur.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="form-grid"
        >
          <label>
            Karantina Stoku

            <select
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setDestinationId('');
              }}
              required
            >
              <option value="">
                Stok seçin
              </option>

              {sources.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.product_name}
                  {' · '}
                  {item.sku}
                  {' · '}
                  {item.warehouse_name}
                  {' / '}
                  {item.location_code}
                  {' · '}
                  Miktar {item.physical}
                </option>
              ))}
            </select>
          </label>

          <label>
            İşlem

            <select
              value={actionType}
              onChange={(e) => {
                setActionType(
                  e.target.value as
                    | 'RELEASE'
                    | 'DISPOSE'
                    | 'RETURN',
                );

                setDestinationId('');
              }}
            >
              <option value="RELEASE">
                Serbest Bırak
              </option>

              <option value="DISPOSE">
                İmha Et
              </option>

              <option value="RETURN">
                Tedarikçiye İade
              </option>
            </select>
          </label>

          <label>
            Miktar

            <input
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(e) =>
                setQuantity(e.target.value)
              }
              required
            />
          </label>

          {actionType === 'RELEASE' && (
            <label>
              Hedef Lokasyon

              <select
                value={destinationId}
                onChange={(e) =>
                  setDestinationId(e.target.value)
                }
                required
              >
                <option value="">
                  Hedef seçin
                </option>

                {targets.map((location) => (
                  <option
                    key={location.id}
                    value={location.id}
                  >
                    {location.code}
                    {' · '}
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Sebep

            <input
              value={reason}
              onChange={(e) =>
                setReason(e.target.value)
              }
              placeholder="Örn. kalite kontrol onayı"
            />
          </label>

          <label className="span-2">
            Not

            <textarea
              value={note}
              onChange={(e) =>
                setNote(e.target.value)
              }
              rows={3}
              placeholder="İşleme ilişkin açıklama"
            />
          </label>

          {selected && (
            <div className="span-2 muted">
              Mevcut karantina:
              {' '}
              {selected.physical}
              {' · Hasarlı: '}
              {selected.damaged}
              {' · Lot: '}
              {selected.lot || '-'}
              {' · Seri: '}
              {selected.serial || '-'}
            </div>
          )}

          <div className="span-2">
            <button
              type="submit"
              className="primary-button"
              disabled={busy}
            >
              {busy
                ? 'İşleniyor...'
                : 'İşlemi Tamamla'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Karantinadaki Stoklar</h2>
            <p>
              Fiziki ve hasarlı miktarı bulunan aktif kayıtlar.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Depo</th>
                <th>Lokasyon</th>
                <th>Fiziki</th>
                <th>Hasarlı</th>
                <th>Lot / Seri</th>
              </tr>
            </thead>

            <tbody>
              {sources.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>
                      {item.product_name}
                    </strong>
                    <div className="muted">
                      {item.sku}
                    </div>
                  </td>

                  <td>
                    {item.warehouse_name}
                  </td>

                  <td>
                    {item.location_code}
                  </td>

                  <td>
                    {item.physical}
                  </td>

                  <td>
                    {item.damaged}
                  </td>

                  <td>
                    {item.lot || '-'}
                    {' / '}
                    {item.serial || '-'}
                  </td>
                </tr>
              ))}

              {!sources.length && (
                <tr>
                  <td colSpan={6}>
                    Aktif karantina stoku bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Karantina İşlem Geçmişi</h2>
            <p>
              Son 100 işlem.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İşlem</th>
                <th>Ürün</th>
                <th>Miktar</th>
                <th>Kaynak</th>
                <th>Hedef</th>
                <th>Sebep</th>
              </tr>
            </thead>

            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>
                    {new Date(
                      item.created_at,
                    ).toLocaleString('tr-TR')}
                  </td>

                  <td>
                    {actionName(
                      item.action_type,
                    )}
                  </td>

                  <td>
                    {item.product_name}
                  </td>

                  <td>
                    {item.quantity}
                  </td>

                  <td>
                    {item.source_location_code}
                  </td>

                  <td>
                    {item.destination_location_code ??
                      'Depo dışı'}
                  </td>

                  <td>
                    {item.reason || '-'}
                  </td>
                </tr>
              ))}

              {!history.length && (
                <tr>
                  <td colSpan={7}>
                    Henüz karantina işlemi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}