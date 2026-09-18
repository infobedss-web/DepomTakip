import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type Row } from './api';

export function StockAdjustment() {
  const [sources, setSources] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);

  const [stockId, setStockId] = useState('');
  const [type, setType] = useState('DECREASE');
  const [quantity, setQuantity] = useState(1);
  const [reasonCode, setReasonCode] =
    useState('PHYSICAL_CORRECTION');

  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [sourceData, historyData] =
        await Promise.all([
          api<Row[]>('/stock-adjustments/sources'),
          api<Row[]>('/stock-adjustments/history'),
        ]);

      setSources(sourceData);
      setHistory(historyData);

      if (!stockId && sourceData.length) {
        setStockId(sourceData[0].stock_id);
      }
    } catch (e: any) {
      setError(
        e.message ||
          'Stok düzeltme verileri alınamadı.',
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
        (x) => x.stock_id === stockId,
      ),
    [sources, stockId],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!stockId) {
      setError('Stok seçmelisin.');
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      setError(
        'Düzeltme miktarı sıfırdan büyük olmalı.',
      );
      return;
    }

    if (reason.trim().length < 3) {
      setError(
        'Düzeltme nedeni zorunludur.',
      );
      return;
    }

    setSaving(true);

    try {
      await api(
        '/stock-adjustments',
        'POST',
        {
          stock_id: stockId,
          adjustment_type: type,
          quantity: Number(quantity),
          reason_code: reasonCode,
          reason: reason.trim(),
          note: note.trim(),
        },
      );

      setQuantity(1);
      setReason('');
      setNote('');

      setSuccess(
        'Stok düzeltme başarıyla kaydedildi.',
      );

      await load();
    } catch (e: any) {
      setError(
        e.message ||
          'Stok düzeltme işlemi başarısız.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading">
        Stok düzeltme yükleniyor…
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            KONTROLLÜ STOK HAREKETİ
          </div>

          <h1>Stok Düzeltme</h1>

          <p className="muted">
            Fiziki stok farklarını gerekçeli
            ve kayıt altında düzeltin.
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
        <div
          role="status"
          className="alert success"
        >
          {success}
        </div>
      )}

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Yeni Stok Düzeltme</h2>
            <p className="muted">
              Her işlem kullanıcı ve gerekçe
              bilgisiyle kaydedilir.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="form-grid"
        >
          <label>
            Stok

            <select
              value={stockId}
              onChange={(e) =>
                setStockId(e.target.value)
              }
            >
              {sources.map((x) => (
                <option
                  key={x.stock_id}
                  value={x.stock_id}
                >
                  {x.product_name}
                  {' · '}
                  {x.sku}
                  {' · '}
                  {x.warehouse_name}
                  {' / '}
                  {x.location_name}
                  {' · Stok: '}
                  {x.physical}
                  {x.lot
                    ? ` · Lot ${x.lot}`
                    : ''}
                  {x.serial
                    ? ` · Seri ${x.serial}`
                    : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            İşlem

            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value)
              }
            >
              <option value="INCREASE">
                Stok Artır
              </option>

              <option value="DECREASE">
                Stok Azalt
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
                setQuantity(
                  Number(e.target.value),
                )
              }
            />
          </label>

          <label>
            Neden Türü

            <select
              value={reasonCode}
              onChange={(e) =>
                setReasonCode(
                  e.target.value,
                )
              }
            >
              <option value="COUNT_VARIANCE">
                Sayım Farkı
              </option>

              <option value="DATA_CORRECTION">
                Veri Düzeltme
              </option>

              <option value="PHYSICAL_CORRECTION">
                Fiziki Düzeltme
              </option>

              <option value="OTHER">
                Diğer
              </option>
            </select>
          </label>

          <label>
            Düzeltme Nedeni

            <input
              value={reason}
              onChange={(e) =>
                setReason(e.target.value)
              }
              placeholder="Örn. Fiziki sayım ile sistem farkı"
            />
          </label>

          <label>
            Not

            <input
              value={note}
              onChange={(e) =>
                setNote(e.target.value)
              }
              placeholder="İsteğe bağlı açıklama"
            />
          </label>

          {selected && (
            <div className="card">
              <strong>
                Seçilen Stok
              </strong>

              <p>
                {selected.product_name}
                {' · '}
                {selected.location_name}
              </p>

              <p>
                Fiziki: {selected.physical}
                {' · '}
                Rezerve: {selected.reserved}
                {' · '}
                Hasarlı: {selected.damaged}
              </p>

              <p>
                Kullanılabilir:{' '}
                {selected.available}
              </p>
            </div>
          )}

          <div className="button-row">
            <button
              className="primary"
              disabled={saving}
              type="submit"
            >
              {saving
                ? 'Kaydediliyor…'
                : 'Stok Düzeltmeyi Kaydet'}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Düzeltme Geçmişi</h2>
            <p className="muted">
              Son 200 stok düzeltme işlemi.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Ürün</th>
                <th>Lokasyon</th>
                <th>İşlem</th>
                <th>Miktar</th>
                <th>Önce</th>
                <th>Sonra</th>
                <th>Neden</th>
                <th>Kullanıcı</th>
              </tr>
            </thead>

            <tbody>
              {history.map((x) => (
                <tr key={x.id}>
                  <td>
                    {new Date(
                      x.created_at,
                    ).toLocaleString('tr-TR')}
                  </td>

                  <td>
                    <strong>
                      {x.product_name}
                    </strong>

                    <small>
                      {x.sku}
                    </small>
                  </td>

                  <td>
                    {x.warehouse_name}
                    <small>
                      {x.location_name}
                    </small>
                  </td>

                  <td>
                    {x.adjustment_type ===
                    'INCREASE'
                      ? 'Artırma'
                      : 'Azaltma'}
                  </td>

                  <td>{x.quantity}</td>
                  <td>{x.before_quantity}</td>
                  <td>{x.after_quantity}</td>

                  <td>
                    {x.reason}
                    <small>
                      {x.reason_code}
                    </small>
                  </td>

                  <td>
                    {x.created_by_name}
                  </td>
                </tr>
              ))}

              {!history.length && (
                <tr>
                  <td colSpan={9}>
                    Henüz stok düzeltme
                    işlemi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}