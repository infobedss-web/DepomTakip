import { useEffect, useMemo, useState } from 'react';
import { api, type Row } from './api';

type QuantityMap = Record<string, string>;

export function InitialStock({
  user,
}: {
  user: Row;
}) {
  const [warehouses, setWarehouses] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('Başlangıç Stok Girişi');
  const [note, setNote] = useState('BEDSS başlangıç stok kaydı');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [warehouseData, productData] = await Promise.all([
        api<Row[]>('/warehouses'),
        api<Row[]>('/products'),
      ]);

      setWarehouses(warehouseData);
      setProducts(productData);

      if (warehouseData.length) {
        setWarehouseId((current) => current || warehouseData[0].id);
      }
    } catch (e: any) {
      setError(e?.message || 'Veriler alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedWarehouse = useMemo(
    () => warehouses.find((x) => x.id === warehouseId),
    [warehouses, warehouseId],
  );

  const warehouseProducts = useMemo(() => {
    if (!selectedWarehouse) return [];

    return products.filter((p) => {
      if (!p.business_id) return true;

      return p.business_id === selectedWarehouse.business_id;
    });
  }, [products, selectedWarehouse]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');

    if (!q) return warehouseProducts;

    return warehouseProducts.filter((p) =>
      [
        p.name,
        p.sku,
        p.barcode,
        p.brand,
        p.variant,
        p.category,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLocaleLowerCase('tr-TR')
            .includes(q),
        ),
    );
  }, [warehouseProducts, search]);

  const selectedItems = useMemo(
    () =>
      warehouseProducts
        .map((p) => ({
          product: p,
          quantity: Number(
            String(quantities[p.id] || '0').replace(',', '.'),
          ),
        }))
        .filter((x) => Number.isFinite(x.quantity) && x.quantity > 0),
    [warehouseProducts, quantities],
  );

  const totalQuantity = selectedItems.reduce(
    (sum, row) => sum + row.quantity,
    0,
  );

  function setQuantity(productId: string, value: string) {
    setQuantities((current) => ({
      ...current,
      [productId]: value,
    }));
  }

  function clearQuantities() {
    setQuantities({});
    setError('');
    setSuccess('');
  }

  async function saveStocks() {
    setError('');
    setSuccess('');

    if (!warehouseId || !selectedWarehouse) {
      setError('Önce depo seçmelisin.');
      return;
    }

    if (!selectedItems.length) {
      setError('En az bir ürüne sıfırdan büyük miktar gir.');
      return;
    }

    if (!supplier.trim()) {
      setError('Stok giriş açıklaması boş olamaz.');
      return;
    }

    const businessId =
      user.business_id ||
      selectedWarehouse.business_id;

    if (!businessId) {
      setError('Firma bilgisi belirlenemedi.');
      return;
    }

    const invalid = selectedItems.find(
      (x) =>
        x.quantity <= 0 ||
        x.quantity > 999999999 ||
        Math.round(x.quantity * 1000) !== x.quantity * 1000,
    );

    if (invalid) {
      setError(
        `${invalid.product.name}: miktar en fazla 3 ondalık basamak içerebilir.`,
      );
      return;
    }

    if (
      !confirm(
        `${selectedItems.length} ürün için toplam ${totalQuantity.toLocaleString(
          'tr-TR',
        )} birim başlangıç stoğu kaydedilsin mi?`,
      )
    ) {
      return;
    }

    setSaving(true);

    let createdReceiptId = '';

    try {
      const receipt = await api<Row>(
        '/goods-receipts',
        'POST',
        {
          business_id: businessId,
          warehouse_id: warehouseId,
          supplier: supplier.trim(),
          document_number: '',
          document_photo_id: null,
          note: note.trim(),
          items: selectedItems.map(({ product, quantity }) => ({
            product_id: product.id,
            quantity,
            unit: 'Adet',
            lot: '',
            serial: '',
            expiry_date: null,
            condition: 'GOOD',
            note: 'Başlangıç stok girişi',
          })),
        },
      );

      createdReceiptId = receipt.id;

      await api(
        `/goods-receipts/${receipt.id}/complete`,
        'POST',
      );

      setSuccess(
        `${selectedItems.length} ürünün başlangıç stoğu başarıyla kaydedildi. ` +
          `Stoklar deponun Kabul Alanına işlendi. Şimdi Rafa Yerleştirme ekranından ürünleri gerçek raf, kat veya hücre lokasyonlarına taşıyın.`,
      );

      setQuantities({});
    } catch (e: any) {
      if (createdReceiptId) {
        setError(
          `Mal kabul taslağı oluşturuldu fakat stok tamamlama başarısız oldu. ` +
            `Taslak No: ${createdReceiptId}. ` +
            `${e?.message || ''}`,
        );
      } else {
        setError(e?.message || 'Başlangıç stoğu kaydedilemedi.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading">Başlangıç stoğu yükleniyor…</div>;
  }

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STOK YÖNETİMİ</div>
          <h1>Başlangıç Stoğu</h1>
          <p>
            İlk kurulumda ürünlerin mevcut miktarlarını toplu olarak
            sisteme kaydedin.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: '#dc2626',
          }}
        >
          <strong>İşlem yapılamadı</strong>
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: '#16a34a',
          }}
        >
          <strong>Stok kaydedildi</strong>
          <p>{success}</p>
        </div>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h2>Stok Giriş Bilgileri</h2>
            <p className="muted">
              Stoklar ilk olarak seçilen deponun BUFFER / Kabul Alanına
              alınır.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          <label>
            <span>Depo</span>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setQuantities({});
                setSuccess('');
                setError('');
              }}
            >
              <option value="">Depo seç</option>

              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.business_name
                    ? `${w.business_name} — ${w.name}`
                    : w.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Giriş Açıklaması</span>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Başlangıç Stok Girişi"
            />
          </label>

          <label>
            <span>Not</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="İlk stok kurulumu"
            />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Ürün Miktarları</h2>
            <p className="muted">
              Sadece miktar girilen ürünler kaydedilir.
            </p>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="secondary"
              onClick={clearQuantities}
              disabled={saving}
            >
              Miktarları Temizle
            </button>

            <button
              type="button"
              onClick={() => void saveStocks()}
              disabled={saving || !selectedItems.length}
            >
              {saving
                ? 'Kaydediliyor…'
                : `Stokları Kaydet (${selectedItems.length})`}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı, SKU veya barkod ara…"
            style={{ width: '100%' }}
          />
        </div>

        {!selectedWarehouse ? (
          <p className="muted">Önce depo seç.</p>
        ) : !warehouseProducts.length ? (
          <p className="muted">
            Seçilen firmaya ait ürün bulunamadı.
          </p>
        ) : (
          <>
            <div
              style={{
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  width: '100%',
                  minWidth: 760,
                }}
              >
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th>SKU</th>
                    <th>Barkod</th>
                    <th style={{ width: 180 }}>Başlangıç Miktarı</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        {p.variant && <small>{p.variant}</small>}
                      </td>

                      <td>{p.sku || '—'}</td>
                      <td>{p.barcode || '—'}</td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          max="999999999"
                          step="0.001"
                          value={quantities[p.id] || ''}
                          onChange={(e) =>
                            setQuantity(p.id, e.target.value)
                          }
                          placeholder="0"
                          style={{
                            width: '100%',
                            fontWeight:
                              Number(quantities[p.id] || 0) > 0
                                ? 700
                                : 400,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: '1px solid var(--border, #e5e7eb)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>
                  {selectedItems.length} ürün seçildi
                </strong>
                <div className="muted">
                  Toplam miktar:{' '}
                  {totalQuantity.toLocaleString('tr-TR')}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void saveStocks()}
                disabled={saving || !selectedItems.length}
              >
                {saving
                  ? 'Stoklar Kaydediliyor…'
                  : 'Stokları Kaydet'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
