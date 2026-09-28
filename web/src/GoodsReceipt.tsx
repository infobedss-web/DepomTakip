import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, type Row } from './api';

type Condition = 'GOOD' | 'DAMAGED' | 'QUARANTINE';

type ItemRow = {
  product_id: string;
  quantity: number;
  unit: string;
  lot: string;
  serial: string;
  expiry_date: string;
  condition: Condition;
  note: string;
};

const emptyItem = (): ItemRow => ({
  product_id: '',
  quantity: 1,
  unit: 'Adet',
  lot: '',
  serial: '',
  expiry_date: '',
  condition: 'GOOD',
  note: '',
});

function statusLabel(value: string) {
  if (value === 'DRAFT') return 'TASLAK';
  if (value === 'COMPLETED') return 'TAMAMLANDI';
  if (value === 'CANCELLED') return 'İPTAL';
  return value;
}

function conditionLabel(value: Condition) {
  if (value === 'GOOD') return 'Sağlam';
  if (value === 'DAMAGED') return 'Hasarlı';
  return 'Karantina';
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () =>
      reject(new Error('Belge okunamadı.'));

    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.split(',')[1] || '');
    };

    reader.readAsDataURL(file);
  });
}

export function GoodsReceipt({
  user,
}: {
  user: Row;
}) {
  const [warehouses, setWarehouses] =
    useState<Row[]>([]);
  const [products, setProducts] =
    useState<Row[]>([]);
  const [receipts, setReceipts] =
    useState<Row[]>([]);

  const [warehouseId, setWarehouseId] =
    useState('');
  const [supplier, setSupplier] =
    useState('');
  const [documentNumber, setDocumentNumber] =
    useState('');
  const [note, setNote] = useState('');

  const [documentFile, setDocumentFile] =
    useState<File | null>(null);

  const [documentPreview, setDocumentPreview] =
    useState('');

  const [items, setItems] =
    useState<ItemRow[]>([emptyItem()]);

  const [productSearch, setProductSearch] =
    useState('');

  const [selectedReceipt, setSelectedReceipt] =
    useState<Row | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [
        warehouseData,
        productData,
        receiptData,
      ] = await Promise.all([
        api<Row[]>('/warehouse-operation-warehouses'),
        api<Row[]>('/warehouse-operation-products'),
        api<Row[]>('/goods-receipts'),
      ]);

      setWarehouses(warehouseData);
      setProducts(productData);
      setReceipts(receiptData);

      if (!warehouseId && warehouseData.length) {
        setWarehouseId(warehouseData[0].id);
      }
    } catch (e: any) {
      setError(e.message || 'Veriler alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!documentFile) {
      setDocumentPreview('');
      return;
    }

    if (!documentFile.type.startsWith('image/')) {
      setDocumentPreview('');
      return;
    }

    const url = URL.createObjectURL(documentFile);
    setDocumentPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [documentFile]);

  const selectedWarehouse = useMemo(
    () =>
      warehouses.find(
        (x) => x.id === warehouseId,
      ),
    [warehouses, warehouseId],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLocaleLowerCase('tr-TR');

    if (!q) return products;

    return products.filter((p) =>
      [
        p.name,
        p.sku,
        p.barcode,
        p.variant,
        p.brand,
      ]
        .filter(Boolean)
        .some((v) =>
          String(v)
            .toLocaleLowerCase('tr-TR')
            .includes(q),
        ),
    );
  }, [products, productSearch]);

  function productUnits(productId: string) {
    const product = products.find(
      (x) => x.id === productId,
    );

    if (
      !product?.units ||
      !Array.isArray(product.units)
    ) {
      return ['Adet'];
    }

    const units = product.units
      .map((x: any) => x.name)
      .filter(Boolean);

    return units.length ? units : ['Adet'];
  }

  function updateItem(
    index: number,
    key: keyof ItemRow,
    value: string | number,
  ) {
    setItems((current) =>
      current.map((item, i) => {
        if (i !== index) return item;

        const updated = {
          ...item,
          [key]: value,
        } as ItemRow;

        if (key === 'product_id') {
          updated.unit =
            productUnits(String(value))[0] ||
            'Adet';
        }

        return updated;
      }),
    );
  }

  function resetForm() {
    setSupplier('');
    setDocumentNumber('');
    setNote('');
    setDocumentFile(null);
    setItems([emptyItem()]);
    setProductSearch('');
  }

  async function uploadDocument() {
    if (!documentFile) return null;

    if (documentFile.size > 5 * 1024 * 1024) {
      throw new Error(
        'Belge en fazla 5 MB olabilir.',
      );
    }

    if (
      ![
        'image/jpeg',
        'image/png',
        'application/pdf',
      ].includes(documentFile.type)
    ) {
      throw new Error(
        'Belge JPEG, PNG veya PDF olmalıdır.',
      );
    }

    const data = await fileToBase64(documentFile);

    const document = await api<Row>(
      '/goods-receipts/document',
      'POST',
      {
        filename: documentFile.name,
        mime_type: documentFile.type,
        data,
      },
    );

    return document.id;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!warehouseId) {
      setError('Depo seçmelisin.');
      return;
    }

    if (!supplier.trim()) {
      setError('Tedarikçi zorunlu.');
      return;
    }

    if (
      items.some(
        (x) =>
          !x.product_id ||
          !x.quantity ||
          Number(x.quantity) <= 0,
      )
    ) {
      setError(
        'Tüm satırlarda ürün ve miktar zorunlu.',
      );
      return;
    }

    const businessId =
      user.business_id ||
      selectedWarehouse?.business_id;

    if (!businessId) {
      setError(
        'Bayi bilgisi belirlenemedi.',
      );
      return;
    }

    setSaving(true);

    try {
      const documentPhotoId =
        await uploadDocument();

      const receipt = await api<Row>(
        '/goods-receipts',
        'POST',
        {
          business_id: businessId,
          warehouse_id: warehouseId,
          supplier: supplier.trim(),
          document_number:
            documentNumber.trim(),
          document_photo_id:
            documentPhotoId,
          note: note.trim(),

          items: items.map((x) => ({
            product_id: x.product_id,
            quantity: Number(x.quantity),
            unit: x.unit,
            lot: x.lot.trim(),
            serial: x.serial.trim(),
            expiry_date:
              x.expiry_date || null,
            condition: x.condition,
            note: x.note.trim(),
          })),
        },
      );

      resetForm();

      setSuccess(
        'Mal kabul taslak olarak oluşturuldu. Henüz stok değişmedi.',
      );

      const receiptData =
        await api<Row[]>('/goods-receipts');

      setReceipts(receiptData);

      const fresh = receiptData.find(
        (x) => x.id === receipt.id,
      );

      if (fresh) setSelectedReceipt(fresh);
    } catch (e: any) {
      setError(
        e.message ||
          'Mal kabul oluşturulamadı.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function completeReceipt(id: string) {
    if (
      !confirm(
        'Mal kabul tamamlansın mı? Bu işlem Kabul Alanı stoğunu artıracaktır.',
      )
    ) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api(
        `/goods-receipts/${id}/complete`,
        'POST',
      );

      const receiptData =
        await api<Row[]>('/goods-receipts');

      setReceipts(receiptData);

      setSelectedReceipt(
        receiptData.find((x) => x.id === id) ||
          null,
      );

      setSuccess(
        'Mal kabul tamamlandı. Ürünler Kabul Alanı stoğuna işlendi.',
      );
    } catch (e: any) {
      setError(
        e.message ||
          'Mal kabul tamamlanamadı.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelReceipt(id: string) {
    if (!confirm('Taslak iptal edilsin mi?')) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api(
        `/goods-receipts/${id}/cancel`,
        'POST',
      );

      const receiptData =
        await api<Row[]>('/goods-receipts');

      setReceipts(receiptData);

      setSelectedReceipt(
        receiptData.find((x) => x.id === id) ||
          null,
      );

      setSuccess('Taslak iptal edildi.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading">
        Mal kabul yükleniyor…
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

          <h1>Mal Kabul</h1>

          <p>
            Gelen ürünü önce Kabul Alanı /
            BUFFER stoğuna alın. Rafa yerleştirme
            sonraki operasyonda yapılır.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error">
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
          style={{ marginBottom: 18 }}
        >
          <div className="section-head">
            <div>
              <h2>Yeni Mal Kabul</h2>
              <p className="muted">
                Önce taslak oluşturulur. Taslak
                stoğu değiştirmez.
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
              Depo
              <select
                value={warehouseId}
                onChange={(e) =>
                  setWarehouseId(e.target.value)
                }
                required
              >
                <option value="">
                  Depo seç
                </option>

                {warehouses.map((w) => (
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
              Tedarikçi
              <input
                value={supplier}
                onChange={(e) =>
                  setSupplier(e.target.value)
                }
                placeholder="Örn. ABC Gıda"
                required
              />
            </label>

            <label>
              Belge / İrsaliye No
              <input
                value={documentNumber}
                onChange={(e) =>
                  setDocumentNumber(
                    e.target.value,
                  )
                }
                placeholder="IRS-2026-001"
              />
            </label>

            <label>
              Belge Fotoğrafı / PDF
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) =>
                  setDocumentFile(
                    e.target.files?.[0] ||
                      null,
                  )
                }
              />
            </label>
          </div>

          {documentPreview && (
            <div style={{ marginTop: 14 }}>
              <img
                src={documentPreview}
                alt="Belge önizleme"
                style={{
                  width: 180,
                  maxHeight: 180,
                  objectFit: 'contain',
                  borderRadius: 10,
                }}
              />
            </div>
          )}

          <label style={{ marginTop: 14 }}>
            Genel Not
            <textarea
              value={note}
              onChange={(e) =>
                setNote(e.target.value)
              }
              maxLength={2000}
              rows={3}
              placeholder="Mal kabul ile ilgili not…"
            />
          </label>
        </section>

        <section className="card">
          <div className="section-head">
            <div>
              <h2>Ürünler</h2>
              <p className="muted">
                Barkod, SKU veya ürün adıyla
                arayabilirsiniz.
              </p>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                setItems((x) => [
                  ...x,
                  emptyItem(),
                ])
              }
            >
              + Satır Ekle
            </button>
          </div>

          <label
            style={{
              maxWidth: 420,
              marginBottom: 14,
            }}
          >
            Barkod / SKU / Ürün Ara
            <input
              value={productSearch}
              onChange={(e) =>
                setProductSearch(
                  e.target.value,
                )
              }
              placeholder="Barkod okut veya yaz…"
            />
          </label>

          <div
            style={{
              width: '100%',
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 1350,
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 250 }}>
                    Ürün
                  </th>
                  <th style={{ width: 100 }}>
                    Miktar
                  </th>
                  <th style={{ width: 110 }}>
                    Birim
                  </th>
                  <th style={{ width: 120 }}>
                    Lot
                  </th>
                  <th style={{ width: 130 }}>
                    Seri No
                  </th>
                  <th style={{ width: 140 }}>
                    SKT
                  </th>
                  <th style={{ width: 140 }}>
                    Durum
                  </th>
                  <th style={{ width: 220 }}>
                    Not
                  </th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => {
                  const units =
                    productUnits(
                      item.product_id,
                    );

                  return (
                    <tr key={index}>
                      <td>
                        <select
                          value={
                            item.product_id
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              'product_id',
                              e.target.value,
                            )
                          }
                          required
                        >
                          <option value="">
                            Ürün seç
                          </option>

                          {filteredProducts.map(
                            (p) => (
                              <option
                                key={p.id}
                                value={p.id}
                              >
                                {p.sku} —{' '}
                                {p.name}
                                {p.barcode
                                  ? ` — ${p.barcode}`
                                  : ''}
                              </option>
                            ),
                          )}
                        </select>
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              index,
                              'quantity',
                              Number(
                                e.target.value,
                              ),
                            )
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={item.unit}
                          onChange={(e) =>
                            updateItem(
                              index,
                              'unit',
                              e.target.value,
                            )
                          }
                        >
                          {units.map((u) => (
                            <option
                              key={u}
                              value={u}
                            >
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input
                          value={item.lot}
                          onChange={(e) =>
                            updateItem(
                              index,
                              'lot',
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={item.serial}
                          onChange={(e) =>
                            updateItem(
                              index,
                              'serial',
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="date"
                          value={
                            item.expiry_date
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              'expiry_date',
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={
                            item.condition
                          }
                          onChange={(e) =>
                            updateItem(
                              index,
                              'condition',
                              e.target
                                .value as Condition,
                            )
                          }
                        >
                          <option value="GOOD">
                            Sağlam
                          </option>
                          <option value="DAMAGED">
                            Hasarlı
                          </option>
                          <option value="QUARANTINE">
                            Karantina
                          </option>
                        </select>
                      </td>

                      <td>
                        <input
                          value={item.note}
                          onChange={(e) =>
                            updateItem(
                              index,
                              'note',
                              e.target.value,
                            )
                          }
                          placeholder="Opsiyonel"
                        />
                      </td>

                      <td>
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            items.length === 1
                          }
                          onClick={() =>
                            setItems((current) =>
                              current.filter(
                                (_, i) =>
                                  i !== index,
                              ),
                            )
                          }
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 18,
            }}
          >
            <button
              className="primary"
              disabled={saving}
            >
              {saving
                ? 'Kaydediliyor…'
                : 'Taslak Oluştur'}
            </button>
          </div>
        </section>
      </form>

      <section
        className="card"
        style={{ marginTop: 18 }}
      >
        <div className="section-head">
          <div>
            <h2>Mal Kabul Geçmişi</h2>
            <p className="muted">
              Taslak ve tamamlanan kabul
              kayıtları.
            </p>
          </div>
        </div>

        {!receipts.length ? (
          <p className="muted">
            Henüz mal kabul kaydı yok.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 950,
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  <th>Durum</th>
                  <th>Belge No</th>
                  <th>Tedarikçi</th>
                  <th>Depo</th>
                  <th>Satır</th>
                  <th>Toplam</th>
                  <th>Tarih</th>
                  <th>İşlem</th>
                </tr>
              </thead>

              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        {statusLabel(
                          r.status,
                        )}
                      </strong>
                    </td>

                    <td>
                      {r.document_number ||
                        '—'}
                    </td>

                    <td>{r.supplier}</td>
                    <td>
                      {r.warehouse_name}
                    </td>
                    <td>{r.item_count}</td>
                    <td>
                      {Number(
                        r.total_quantity ||
                          0,
                      ).toLocaleString(
                        'tr-TR',
                      )}
                    </td>
                    <td>
                      {new Date(
                        r.received_at,
                      ).toLocaleString(
                        'tr-TR',
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setSelectedReceipt(
                            r,
                          )
                        }
                      >
                        Detay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedReceipt && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setSelectedReceipt(null)
          }
        >
          <div
            className="card"
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              width: 'min(900px,94vw)',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div className="section-head">
              <div>
                <div className="eyebrow">
                  MAL KABUL DETAYI
                </div>

                <h2>
                  {selectedReceipt
                    .document_number ||
                    'Belgesiz Mal Kabul'}
                </h2>
              </div>

              <button
                className="secondary"
                onClick={() =>
                  setSelectedReceipt(
                    null,
                  )
                }
              >
                Kapat
              </button>
            </div>

            <p>
              <strong>Durum:</strong>{' '}
              {statusLabel(
                selectedReceipt.status,
              )}
              <br />

              <strong>
                Tedarikçi:
              </strong>{' '}
              {selectedReceipt.supplier}
              <br />

              <strong>Depo:</strong>{' '}
              {
                selectedReceipt.warehouse_name
              }
              <br />

              <strong>Not:</strong>{' '}
              {selectedReceipt.note ||
                '—'}
            </p>

            <div
              style={{
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  minWidth: 760,
                  width: '100%',
                }}
              >
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th>Miktar</th>
                    <th>Birim</th>
                    <th>Lot</th>
                    <th>Seri</th>
                    <th>Durum</th>
                  </tr>
                </thead>

                <tbody>
                  {(
                    selectedReceipt.items ||
                    []
                  ).map((item: Row) => (
                    <tr key={item.id}>
                      <td>
                        {item.sku} —{' '}
                        {item.product_name}
                      </td>
                      <td>
                        {item.quantity}
                      </td>
                      <td>{item.unit}</td>
                      <td>
                        {item.lot || '—'}
                      </td>
                      <td>
                        {item.serial || '—'}
                      </td>
                      <td>
                        {conditionLabel(
                          item.condition,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedReceipt.status ===
              'DRAFT' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'flex-end',
                  gap: 10,
                  marginTop: 20,
                }}
              >
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() =>
                    cancelReceipt(
                      selectedReceipt.id,
                    )
                  }
                >
                  Taslağı İptal Et
                </button>

                <button
                  className="primary"
                  disabled={saving}
                  onClick={() =>
                    completeReceipt(
                      selectedReceipt.id,
                    )
                  }
                >
                  Mal Kabulü Tamamla
                </button>
              </div>
            )}

            {selectedReceipt.status ===
              'COMPLETED' && (
              <div
                className="alert"
                style={{ marginTop: 20 }}
              >
                Bu kayıt tamamlandı ve salt
                okunurdur. Stok BUFFER /
                Kabul Alanına işlenmiştir.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
