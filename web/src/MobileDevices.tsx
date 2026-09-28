import { useState } from 'react';
import { Smartphone, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from './api';

type PairingResult = {
  code: string;
  serverUrl: string;
  expiresAt: string;
  qr: string;
};

export function MobileDevices() {
  const [pairing, setPairing] = useState<PairingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function createPairing() {
    try {
      setLoading(true);
      setError('');

      const result = await api<PairingResult>(
        '/mobile-pairing/create',
        'POST',
        {},
      );

      setPairing(result);
    } catch (e: any) {
      setError(e?.message || 'QR kod oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DepomTakip MOBILE</div>
          <h1>Mobil Cihazlar</h1>
          <p>
            Sayım görevlilerinin telefonlarını bu DepomTakip sistemine güvenli
            şekilde bağlayın.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 18,
          padding: 28,
          boxShadow: '0 8px 30px rgba(15,23,42,.06)',
        }}
      >
        {!pairing ? (
          <>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: '#f1f5f9',
                display: 'grid',
                placeItems: 'center',
                marginBottom: 18,
              }}
            >
              <Smartphone size={30} />
            </div>

            <h2>Yeni Mobil Cihaz Bağla</h2>

            <p className="muted" style={{ maxWidth: 650 }}>
              DepomTakip Mobile yüklü telefondan oluşturacağınız QR kodu okutun.
              Telefon bu bilgisayardaki DepomTakip sisteminin bağlantı bilgilerini
              otomatik olarak alacaktır.
            </p>

            <button
              className="primary"
              onClick={createPairing}
              disabled={loading}
              style={{ marginTop: 14 }}
            >
              <QrCode size={18} />
              {loading ? 'QR hazırlanıyor...' : 'QR Kod Oluştur'}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="eyebrow">MOBİL CİHAZ EŞLEŞTİRME</div>
            <h2>Telefondan QR kodu okutun</h2>

            <p className="muted">
              DepomTakip Mobile → Sistem Bağlantısı → QR Kod ile Bağlan
            </p>

            <div
              style={{
                display: 'inline-block',
                padding: 18,
                margin: '18px auto',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 18,
              }}
            >
              <img
                src={pairing.qr}
                width={300}
                height={300}
                alt="DepomTakip mobil eşleştirme QR kodu"
              />
            </div>

            <div
              style={{
                maxWidth: 520,
                margin: '0 auto 20px',
                textAlign: 'left',
                background: '#f8fafc',
                padding: 18,
                borderRadius: 14,
              }}
            >
              <div>
                <strong>Eşleştirme Kodu:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontSize: 18 }}>
                  {pairing.code}
                </span>
              </div>

              <div style={{ marginTop: 8 }}>
                <strong>DepomTakip Adresi:</strong> {pairing.serverUrl}
              </div>

              <div style={{ marginTop: 8 }}>
                <strong>Geçerlilik:</strong>{' '}
                {new Date(pairing.expiresAt).toLocaleTimeString('tr-TR')}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button className="secondary" onClick={createPairing}>
                <RefreshCw size={17} />
                Yeni QR Oluştur
              </button>

              <button
                className="secondary"
                onClick={() => setPairing(null)}
              >
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          background: '#f8fafc',
          padding: 18,
          borderRadius: 14,
        }}
      >
        <ShieldCheck size={22} />

        <div>
          <strong>Güvenli eşleştirme</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            QR kod personel şifresini içermez. Eşleştirme kodu kısa süre
            geçerlidir ve kullanıldıktan sonra tekrar kullanılamaz.
          </div>
        </div>
      </div>
    </div>
  );
}