import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Camera } from 'lucide-react';
import { labels, type Row } from './api';
import { BrowserMultiFormatReader } from '@zxing/browser';

export function Badge({ value }: { value: string }) {
  return <span className={`badge ${value.toLowerCase()}`}>{labels[value] || value}</span>;
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="section-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Kapat" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: any;
  required?: boolean;
};
export function DataForm({
  fields,
  onSubmit,
  submit = 'Kaydet',
}: {
  fields: Field[];
  onSubmit: (b: Row) => Promise<void>;
  submit?: string;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const data = Object.fromEntries(new FormData(e.currentTarget));
          await onSubmit(data);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select name={f.name} defaultValue={f.value ?? ''} required={f.required !== false}>
                <option value="">Seçiniz</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type || 'text'}
                defaultValue={f.value}
                required={f.required !== false}
                step={f.type === 'number' ? '0.001' : undefined}
                min={f.type === 'number' ? 0 : undefined}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button disabled={busy} className="primary">
          {busy ? 'Kaydediliyor…' : submit}
        </button>
      </div>
    </form>
  );
}
export function Empty({ text = 'Henüz kayıt bulunmuyor.' }: { text?: string }) {
  return <div className="empty">{text}</div>;
}
export function Scanner({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;

    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let zxingControls: { stop: () => void } | undefined;

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            location.protocol !== 'https:' &&
            location.hostname !== 'localhost' &&
            location.hostname !== '127.0.0.1'
              ? 'HTTPS_REQUIRED'
              : 'Bu cihaz kamera erisimini desteklemiyor.',
          );
        }
        /*
         * DepomTakip mobil taramada ZXing kullanir.
         * Native BarcodeDetector cihazdan cihaza tutarsiz
         * calistigi icin burada bilincli olarak kullanilmiyor.
         */const reader = new BrowserMultiFormatReader();

        zxingControls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          video.current!,
          (result) => {
            if (stopped || !result) return;

            const value = result.getText().trim();

            if (value) {
              onScan(value);
              setOpen(false);
            }
          },
        );
      } catch (e) {
        const message =
          e instanceof Error ? e.message : String(e);

        if (
          message === 'HTTPS_REQUIRED' ||
          (
            !window.isSecureContext &&
            location.hostname !== 'localhost' &&
            location.hostname !== '127.0.0.1'
          )
        ) {
          setError(
            'Telefon kamerasini kullanmak icin DepomTakip HTTPS adresinden acilmalidir.',
          );
          return;
        }

        if (
          message.includes('NotAllowed') ||
          message.toLowerCase().includes('permission')
        ) {
          setError(
            'Kamera izni verilmedi. Chrome site ayarlarindan Kamera iznini Acik yapin.',
          );
          return;
        }

        setError('Kamera baslatilamadi: ' + message);
      }
    })();

    return () => {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
      }

      try {
        zxingControls?.stop();
      } catch {}

      stream?.getTracks().forEach((track) => track.stop());

      if (video.current) {
        const activeStream =
          video.current.srcObject as MediaStream | null;

        activeStream
          ?.getTracks()
          .forEach((track) => track.stop());

        video.current.srcObject = null;
      }
    };
  }, [open, onScan]);

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <Camera size={18} /> Kamera
      </button>

      {open && (
        <Modal
          title="QR / Barkod Tara"
          close={() => setOpen(false)}
        >
          {error ? (
            <div className="alert error">{error}</div>
          ) : (
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              style={{
                width: '100%',
                maxHeight: '65vh',
                objectFit: 'cover',
                borderRadius: 16,
                background: '#111',
              }}
            />
          )}

          <p className="muted">
            Oda QR, reyon QR veya urun barkodunu kameraya gosterin.
          </p>
        </Modal>
      )}
    </>
  );
}



