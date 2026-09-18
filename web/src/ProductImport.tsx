import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type Row } from './api';
import { fields, splitBatches, stableJSON, type ImportError } from '../../backend/src/import-contract';
import { defaultMapping, mapSheet, MAX_FILE_BYTES, type SheetData } from './product-import-data';
type Job = {
  id: string;
  business_id: string;
  business_name: string;
  filename: string;
  status: string;
  total_rows: number;
  total_batches: number;
  validated: number;
  inserted: number;
  remaining: number;
  failed: number;
  ready: boolean;
  batches: { batch_no: number; status: string; errors: ImportError[] }[];
};
const hash = async (data: BufferSource) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export function ProductImport({ user }: { user: Row }) {
  const [businesses, setBusinesses] = useState<Row[]>([]),
    [businessId, setBusinessId] = useState(
      user.role === 'SUPER_ADMIN' ? '' : user.business_id || '',
    );
  const [file, setFile] = useState<File | null>(null),
    [fileHash, setFileHash] = useState(''),
    [data, setData] = useState<SheetData | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(''),
    [batchNo, setBatchNo] = useState(0);
  const [error, setError] = useState(''),
    [serverErrors, setServerErrors] = useState<ImportError[]>([]),
    [job, setJob] = useState<Job | null>(null),
    [jobs, setJobs] = useState<Job[]>([]);
  const generation = useRef(0),
    worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    active = useRef<Job | null>(null),
    running = useRef(false);
  const allowed = user.permissions?.includes('urun_yonet');
  function showJob(value: Job) {
    active.current = value;
    setJob(value);
  }
  const refreshJobs = () => api<Job[]>('/products/bulk/jobs').then(setJobs);
  useEffect(() => {
    if (allowed)
      Promise.all([api<Row[]>('/businesses').then(setBusinesses), refreshJobs()]).catch((e) =>
        setError(e.message),
      );
    return () => {
      generation.current++;
      worker.current?.terminate();
      clearTimeout(timer.current);
    };
  }, [allowed]);
  const mapped = useMemo(
    () => (data ? mapSheet(data, mapping) : { rows: [], errors: [] }),
    [data, mapping],
  );
  async function readFile(next: File | null, sheet?: string) {
    if (running.current) return;
    const id = ++generation.current;
    worker.current?.terminate();
    clearTimeout(timer.current);
    setFile(next);
    setData(null);
    setMapping({});
    setFileHash('');
    setJob(null);
    active.current = null;
    setServerErrors([]);
    setError('');
    setBatchNo(0);
    setPhase('');
    setReading(!!next);
    if (!next) return;
    try {
      if (next.size > MAX_FILE_BYTES) throw new Error('Dosya en fazla 20 MB olabilir.');
      const buffer = await next.arrayBuffer();
      const fingerprint = await hash(buffer);
      if (id !== generation.current) return;
      const task = new Worker(new URL('./product-import.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = task;
      const fail = (message: string) => {
        if (id !== generation.current) return;
        task.terminate();
        clearTimeout(timer.current);
        setError(message);
        setReading(false);
      };
      task.onerror = () => fail('Excel dosyası okunamadı. Dosya içeriğini kontrol edin.');
      task.onmessage = (event: MessageEvent<{ data?: SheetData; error?: string }>) => {
        if (id !== generation.current) return;
        clearTimeout(timer.current);
        task.terminate();
        setReading(false);
        if (event.data.error) {
          setError(event.data.error);
          return;
        }
        const parsed = event.data.data!;
        setData(parsed);
        setMapping(defaultMapping(parsed.columns));
        setFileHash(fingerprint);
      };
      timer.current = setTimeout(
        () => fail('Dosya okuma 30 saniye sınırını aştı. Dosyayı küçültün.'),
        30000,
      );
      task.postMessage({ buffer, filename: next.name, sheet }, [buffer]);
    } catch (e) {
      if (id === generation.current) {
        setError((e as Error).message);
        setReading(false);
      }
    }
  }
  async function failure(e: unknown) {
    setError((e as Error).message);
    if (e instanceof ApiError) {
      setServerErrors(e.data.errors || []);
      if (e.data.job) showJob(e.data.job);
    }
    if (active.current)
      try {
        showJob(await api<Job>('/products/bulk/jobs/' + active.current.id));
      } catch {
        /* Keep the last confirmed counters during an outage. */
      }
    if (active.current?.status === 'COMPLETED') setError('');
  }
  async function commit(current: Job) {
    if (current.status === 'COMPLETED') {
      setPhase('Aktarım tamamlandı');
      return;
    }
    if (!current.ready)
      throw new Error(
        'Doğrulama tamamlanmamış. Aynı dosyayı ve eşleştirmeyi seçip Doğrula ve Kaydet ile devam edin.',
      );
    setPhase('Kaydediliyor');
    for (let n = 1; n <= current.total_batches; n++) {
      setBatchNo(n);
      if (current.batches.find((b) => b.batch_no === n)?.status === 'COMMITTED') continue;
      current = (
        await api<{ job: Job }>('/products/bulk', 'POST', {
          mode: 'COMMIT',
          job_id: current.id,
          batch_no: n,
        })
      ).job;
      showJob(current);
    }
    setPhase('Aktarım tamamlandı');
  }
  async function save() {
    if (
      running.current ||
      reading ||
      !data ||
      !file ||
      !fileHash ||
      !businessId ||
      mapped.errors.length ||
      !mapped.rows.length ||
      job?.status === 'COMPLETED'
    )
      return;
    const name = businesses.find((b) => b.id === businessId)?.name;
    if (!name) {
      setError('İşletmeyi seçin.');
      return;
    }
    if (
      !window.confirm(
        `${name} işletmesine ${mapped.rows.length.toLocaleString('tr-TR')} ürün aktarılacak. Onaylıyor musunuz?`,
      )
    )
      return;
    running.current = true;
    setBusy(true);
    setError('');
    setServerErrors([]);
    try {
      const batches = splitBatches(mapped.rows),
        mappingHash = await hash(
          new TextEncoder().encode(stableJSON({ version: 1, sheet: data.sheet, mapping })),
        );
      let current = (
        await api<{ job: Job }>('/products/bulk', 'POST', {
          mode: 'START',
          business_id: businessId,
          file_hash: fileHash,
          mapping_hash: mappingHash,
          filename: file.name,
          total_rows: mapped.rows.length,
          total_batches: batches.length,
        })
      ).job;
      showJob(current);
      if (current.status === 'COMPLETED') {
        setPhase('Bu dosyanın aktarımı zaten tamamlandı');
        return;
      }
      setPhase('Doğrulanıyor');
      for (let i = 0; i < batches.length; i++) {
        setBatchNo(i + 1);
        if (
          current.batches.some(
            (b) => b.batch_no === i + 1 && ['VALIDATED', 'COMMITTED'].includes(b.status),
          )
        )
          continue;
        current = (
          await api<{ job: Job }>('/products/bulk', 'POST', {
            mode: 'VALIDATE',
            job_id: current.id,
            batch_no: i + 1,
            rows: batches[i],
          })
        ).job;
        showJob(current);
      }
      await commit(current);
    } catch (e) {
      await failure(e);
      setPhase(active.current?.status === 'COMPLETED' ? 'Aktarım tamamlandı' : 'Aktarım durdu');
    } finally {
      running.current = false;
      setBusy(false);
      refreshJobs().catch(() => {});
    }
  }
  async function resume(selected: Job) {
    if (running.current || reading) return;
    if (
      !window.confirm(
        `${selected.business_name} işletmesindeki ${selected.filename} aktarımına devam edilsin mi? Kaydedilmiş ürünler tekrar eklenmez.`,
      )
    )
      return;
    running.current = true;
    setBusy(true);
    setError('');
    setServerErrors([]);
    showJob(selected);
    try {
      const current = await api<Job>('/products/bulk/jobs/' + selected.id);
      showJob(current);
      await commit(current);
    } catch (e) {
      await failure(e);
      setPhase(active.current?.status === 'COMPLETED' ? 'Aktarım tamamlandı' : 'Aktarım durdu');
    } finally {
      running.current = false;
      setBusy(false);
      refreshJobs().catch(() => {});
    }
  }
  if (!allowed) return <p>Ürün yönetme yetkisi gerekli.</p>;
  const errors = [...mapped.errors, ...serverErrors],
    total = job?.total_rows || data?.rows.length || 0;
  const percent = job
    ? Math.floor(((job.validated + job.inserted) / (2 * job.total_rows)) * 100)
    : 0;
  return (
    <div>
      <h2>Toplu Ürün Aktarımı</h2>
      <section className="card">
        <p>
          İlk satır kolon başlıkları olmalıdır. XLSX / XLS / UTF-8 CSV; en fazla 20 MB, 10 sayfa,
          seçili sayfada 50.000 veri satırı ve 64 sütun. SKU ve barkodları Excel’de Metin olarak
          saklayın.
        </p>
        <label>
          İşletme
          <select
            aria-label="Aktarım işletmesi"
            value={businessId}
            disabled={busy || user.role !== 'SUPER_ADMIN'}
            onChange={(e) => {
              setBusinessId(e.target.value);
              setJob(null);
              active.current = null;
              setServerErrors([]);
            }}
          >
            <option value="">İşletme seçin</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Excel / CSV Dosyası
          <input
            aria-label="Excel / CSV Dosyası"
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => void readFile(e.target.files?.[0] || null)}
          />
        </label>
        {reading && <p role="status">Dosya okunuyor…</p>}
        {data && (
          <label>
            Çalışma sayfası
            <select
              value={data.sheet}
              disabled={busy || reading}
              onChange={(e) => void readFile(file, e.target.value)}
            >
              {data.names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data && (
        <section className="card section-gap">
          <h3>Kolon Eşleştirme</h3>
          <div className="import-action-bar">
            <div>
              <strong>Ürünleri içe aktarmaya hazırla</strong>
              <p className="muted">
                Firma, dosya ve kolon eşleştirmelerini kontrol edip ürünleri BEDSS veritabanına kaydedin.
              </p>
            </div>

            <button
              type="button"
              className="primary import-save-button"
              onClick={() => void save()}
              disabled={
                busy ||
                reading ||
                !businessId ||
                !mapped.rows.length ||
                !!mapped.errors.length ||
                job?.status === 'COMPLETED'
              }
            >
              {busy ? 'İŞLENİYOR...' : 'ÜRÜNLERİ KAYDET'}
            </button>
          </div>

          {!businessId && (
            <div className="alert">Önce ürünlerin aktarılacağı firmayı seçin.</div>
          )}

          {businessId && data && !mapped.rows.length && !mapped.errors.length && (
            <div className="alert">Aktarılabilir ürün satırı bulunamadı. Kolon eşleştirmelerini kontrol edin.</div>
          )}

          {!!mapped.errors.length && (
            <div className="alert error">
              Ürünler kaydedilmeden önce doğrulama hatalarını düzeltin.
            </div>
          )}
          <p>
            Özel alanlar: en fazla 32 anahtar, anahtar başına 100 karakter, değer başına 2.000
            karakter ve ürün başına toplam 8 KB.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sütun</th>
                  <th>Excel başlığı</th>
                  <th>BEDSS alanı</th>
                </tr>
              </thead>
              <tbody>
                {data.columns.map((col) => (
                  <tr key={col.id}>
                    <td>{col.index + 1}</td>
                    <td>{col.title}</td>
                    <td>
                      <select
                        aria-label={`Sütun ${col.index + 1} eşleştirme`}
                        disabled={busy}
                        value={mapping[col.id] || ''}
                        onChange={(e) => {
                          setMapping((m) => ({ ...m, [col.id]: e.target.value }));
                          setJob(null);
                          active.current = null;
                          setServerErrors([]);
                        }}
                      >
                        <option value="">Aktarma</option>
                        <option value="custom">Özel Alan</option>
                        {fields.map(([key, label]) => (
                          <option
                            key={key}
                            value={key}
                            disabled={Object.entries(mapping).some(
                              ([id, target]) => id !== col.id && target === key,
                            )}
                          >
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Excel Satırı</th>
                  <th>SKU</th>
                  <th>Barkod</th>
                  <th>Ürün</th>
                </tr>
              </thead>
              <tbody>
                {mapped.rows.slice(0, 25).map((row) => (
                  <tr key={row.source_row}>
                    <td>{row.source_row}</td>
                    <td>{row.sku}</td>
                    <td>{row.barcode}</td>
                    <td>{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="card section-gap" aria-label="Aktarım ilerlemesi">
        <h3>{phase || 'Aktarım durumu'}</h3>
        {job && (
          <p>
            {job.business_name} · {job.filename} · Aktarım: {job.id}
          </p>
        )}
        <p>
          Toplam: {total} · Doğrulanan: {job?.validated || 0} · Kaydedilen: {job?.inserted || 0} ·
          Kalan: {job?.remaining ?? total} · Başarısız:{' '}
          {job?.failed || new Set(errors.filter((e) => e.row > 1).map((e) => e.row)).size} · Batch{' '}
          {batchNo} / {job?.total_batches || 0}
        </p>
        <progress max="100" value={percent} />
        <span> %{percent}</span>
        <p>
          Doğrulama %0–50, kayıt %50–100. Her parti atomiktir; hata halinde önceki başarılı partiler
          korunur.
        </p>
        {job && job.status !== 'COMPLETED' && (
          <button disabled={busy || reading} onClick={() => void resume(job)}>
            Devam Et
          </button>
        )}
      </section>
      {!!errors.length && (
        <section className="card">
          <h3>Doğrulama hataları ({errors.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Excel Satırı</th>
                <th>Alan</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, 100).map((e, i) => (
                <tr key={i}>
                  <td>{e.row}</td>
                  <td>{e.field}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.length > 100 && <p>İlk 100 hata gösteriliyor.</p>}
        </section>
      )}
      <section className="card section-gap">
        <h3>Son Aktarımlar</h3>
        <p>
          Sayfa kapansa bile doğrulanmış partiler sunucuda saklanır. Eksik doğrulama için aynı dosya
          ve eşleştirmeyle Doğrula ve Kaydet işlemini yeniden başlatın.
        </p>
        {jobs.map((j) => (
          <div key={j.id}>
            <strong>
              {j.business_name} — {j.filename}
            </strong>{' '}
            · {j.inserted}/{j.total_rows} · {j.status === 'COMPLETED' ? 'Tamamlandı' : j.status}
            <button
              disabled={busy || reading || j.status === 'COMPLETED'}
              onClick={() => void resume(j)}
            >
              Devam Et
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
