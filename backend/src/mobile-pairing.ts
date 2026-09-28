import { Router } from 'express';
import os from 'node:os';
import QRCode from 'qrcode';
import { authenticate } from './security.js';

export const mobilePairing = Router();

function isPrivateIPv4(address: string) {
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;

  const parts = address.split('.').map(Number);
  return (
    parts.length === 4 &&
    parts[0] === 172 &&
    parts[1] >= 16 &&
    parts[1] <= 31
  );
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();

  const preferredNames = [
    'Wi-Fi',
    'WiFi',
    'WLAN',
    'Ethernet'
  ];

  const blockedNames = [
    'tailscale',
    'virtual',
    'vmware',
    'virtualbox',
    'vEthernet',
    'bluetooth',
    'loopback'
  ];

  for (const preferred of preferredNames) {
    for (const [name, entries] of Object.entries(interfaces)) {
      const lowerName = name.toLowerCase();

      if (!lowerName.includes(preferred.toLowerCase())) continue;

      if (
        blockedNames.some((blocked) =>
          lowerName.includes(blocked.toLowerCase())
        )
      ) {
        continue;
      }

      for (const item of entries || []) {
        if (
          item.family === 'IPv4' &&
          !item.internal &&
          item.address &&
          isPrivateIPv4(item.address)
        ) {
          return item.address;
        }
      }
    }
  }

  for (const [name, entries] of Object.entries(interfaces)) {
    const lowerName = name.toLowerCase();

    if (
      blockedNames.some((blocked) =>
        lowerName.includes(blocked.toLowerCase())
      )
    ) {
      continue;
    }

    for (const item of entries || []) {
      if (
        item.family === 'IPv4' &&
        !item.internal &&
        item.address &&
        isPrivateIPv4(item.address)
      ) {
        return item.address;
      }
    }
  }

  return '127.0.0.1';
}

mobilePairing.post(
  '/mobile-pairing/create',
  authenticate,
  async (req, res) => {
    const role = String(req.user.role || '').toUpperCase();

    if (!['SUPER_ADMIN', 'OWNER', 'FIRM_ADMIN'].includes(role)) {
      res.status(403).json({
        error: 'Mobil cihaz bağlantısı oluşturma yetkiniz yok.',
      });
      return;
    }

    const lanAddress = getLanAddress();
    const port = Number(process.env.PORT || 4000);

    // QR doğrudan DepomTakip Web/PWA adresini açar.
    const serverUrl = `http://${lanAddress}:${port}`;

    const qr = await QRCode.toDataURL(serverUrl, {
      width: 320,
      margin: 2,
    });

    res.json({
      serverUrl,
      mobileUrl: serverUrl,
      qr,
    });
  }
);

// Eski mobil istemciler için endpoint korunuyor.
mobilePairing.post('/mobile-pairing/resolve', async (_req, res) => {
  res.status(410).json({
    error:
      'QR eşleştirme yerine telefon kamerasıyla DepomTakip Web bağlantısını açın.',
  });
});