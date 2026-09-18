import { useEffect, useMemo, useState } from 'react';
import { api, type Row } from './api';

type Firm = Row;

type Props = {
  firm: Firm;
  onSaved?: () => void | Promise<void>;
};

type LicenseForm = {
  plan_code: 'TRIAL' | 'BEGINNER' | 'PLUS' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  starts_at: string;
  ends_at: string;
  max_warehouses: number;
  max_users: number;
  note: string;
};

function dateInput(value: unknown) {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function defaultDates() {
  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function toIso(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}

export function LicenseManager({ firm, onSaved }: Props) {
  const defaults = useMemo(() => defaultDates(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [licenseKey, setLicenseKey] = useState('');

  const [form, setForm] = useState<LicenseForm>({
    plan_code: 'TRIAL',
    status: 'ACTIVE',
    starts_at: defaults.start,
    ends_at: defaults.end,
    max_warehouses: 3,
    max_users: 20,
    note: '',
  });

  async function loadExisting() {
    setLoading(true);
    setError('');

    try {
      const rows = await api<Row[]>('/licenses');
      const current = rows.find((row) => row.business_id === firm.id);

      if (!current) {
        setLicenseKey('');
        return;
      }

      setForm({
        plan_code: current.plan_code ?? 'TRIAL',
        status: current.status ?? 'ACTIVE',
        starts_at: dateInput(current.starts_at) || defaults.start,
        ends_at: dateInput(current.ends_at) || defaults.end,
        max_warehouses: Number(current.max_warehouses ?? 3),
        max_users: Number(current.max_users ?? 20),
        note: String(current.note ?? ''),
      });

      setLicenseKey(String(current.license_key ?? ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lisans bilgisi yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadExisting();
    }
  }, [open, firm.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await api(`/licenses/${firm.id}`, 'PUT', {
        ...form,
        starts_at: toIso(form.starts_at),
        ends_at: toIso(form.ends_at),
      });

      const keyed = await api<Row>(`/licenses/${firm.id}/key`, 'POST', {
        rotate: false,
      });

      setLicenseKey(String(keyed.license_key ?? ''));
      setMessage('Lisans kaydedildi ve lisans anahtari hazir.');
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lisans kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  async function rotateKey() {
    const ok = window.confirm(
      'Mevcut lisans anahtari gecersiz olacak ve yeni anahtar uretilecek. Devam edilsin mi?',
    );
    if (!ok) return;

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const keyed = await api<Row>(`/licenses/${firm.id}/key`, 'POST', {
        rotate: true,
      });
      setLicenseKey(String(keyed.license_key ?? ''));
      setMessage('Yeni lisans anahtari olusturuldu.');
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yeni anahtar olusturulamadi.');
    } finally {
      setSaving(false);
    }
  }

  async function copyKey() {
    if (!licenseKey) return;

    try {
      await navigator.clipboard.writeText(licenseKey);
      setMessage('Lisans anahtari kopyalandi.');
    } catch {
      setError('Anahtar panoya kopyalanamadi.');
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Lisansi Duzenle
      </button>
    );
  }

  return (
    <form
      onSubmit={save}
      style={{
        marginTop: 14,
        padding: 20,
        border: '1px solid #dfe7e3',
        borderRadius: 16,
        background: '#fff',
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong>{firm.name} — Lisans</strong>
          <div style={{ marginTop: 5, fontSize: 13, color: '#64748b' }}>
            BEDSS kullanim yetkisini ve lisans anahtarini yonetin.
          </div>
        </div>

        <button type="button" onClick={() => setOpen(false)}>
          Kapat
        </button>
      </div>

      {loading && <div>Lisans bilgisi yukleniyor...</div>}

      <label>
        Plan
        <select
          value={form.plan_code}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              plan_code: e.target.value as LicenseForm['plan_code'],
            }))
          }
        >
          <option value="TRIAL">14 Gun Deneme</option>
          <option value="BEGINNER">Beginner</option>
          <option value="PLUS">Plus</option>
          <option value="PRO">Pro</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
      </label>

      <label>
        Durum
        <select
          value={form.status}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              status: e.target.value as LicenseForm['status'],
            }))
          }
        >
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Askida</option>
          <option value="EXPIRED">Suresi Dolmus</option>
        </select>
      </label>

      <label>
        Baslangic Tarihi
        <input
          type="date"
          value={form.starts_at}
          onChange={(e) =>
            setForm((f) => ({ ...f, starts_at: e.target.value }))
          }
          required
        />
      </label>

      <label>
        Bitis Tarihi
        <input
          type="date"
          value={form.ends_at}
          onChange={(e) =>
            setForm((f) => ({ ...f, ends_at: e.target.value }))
          }
          required
        />
      </label>

      <label>
        Maksimum Depo
        <input
          type="number"
          min={1}
          max={10000}
          value={form.max_warehouses}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              max_warehouses: Number(e.target.value),
            }))
          }
          required
        />
      </label>

      <label>
        Maksimum Kullanici
        <input
          type="number"
          min={1}
          max={1000000}
          value={form.max_users}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              max_users: Number(e.target.value),
            }))
          }
          required
        />
      </label>

      <label>
        Not
        <textarea
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="Orn: Yillik Pro lisansi"
          rows={3}
        />
      </label>

      {licenseKey && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: '#f4faf7',
            border: '1px solid #cfe4d9',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
            Lisans Anahtari
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              wordBreak: 'break-all',
              marginBottom: 10,
            }}
          >
            {licenseKey}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyKey}>
              Kopyala
            </button>
            <button type="button" onClick={rotateKey} disabled={saving}>
              Yeni Anahtar Uret
            </button>
          </div>
        </div>
      )}

      {message && <div style={{ color: '#0f7a55', fontWeight: 600 }}>{message}</div>}
      {error && <div style={{ color: '#b42318', fontWeight: 600 }}>{error}</div>}

      <button type="submit" disabled={saving || loading}>
        {saving ? 'Kaydediliyor...' : 'Lisansi Kaydet'}
      </button>
    </form>
  );
}
