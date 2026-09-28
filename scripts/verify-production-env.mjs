const required = ['DATABASE_URL', 'APP_ORIGIN'];
const errors = [];
const warnings = [];

for (const key of required) {
  if (!process.env[key]?.trim()) errors.push(`${key} tanımlı değil.`);
}

const origin = process.env.APP_ORIGIN?.trim();
if (origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') errors.push('APP_ORIGIN production ortamında HTTPS olmalı.');
  } catch {
    errors.push('APP_ORIGIN geçerli bir URL değil.');
  }
}

const db = process.env.DATABASE_URL?.trim();
if (db) {
  try {
    const url = new URL(db);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) errors.push('DATABASE_URL PostgreSQL bağlantısı olmalı.');
    if (!url.hostname) errors.push('DATABASE_URL host bilgisi içermiyor.');
    if (!url.username) warnings.push('DATABASE_URL kullanıcı adı içermiyor.');
    if (!url.password) warnings.push('DATABASE_URL parola içermiyor.');
    if (!url.pathname || url.pathname === '/') warnings.push('DATABASE_URL veritabanı adı içermiyor.');
  } catch {
    errors.push('DATABASE_URL geçerli bir PostgreSQL URL değil.');
  }
}

if ((process.env.NODE_ENV || '').toLowerCase() !== 'production') {
  warnings.push('NODE_ENV=production değil.');
}

if (!process.env.SESSION_SECRET?.trim()) {
  warnings.push('SESSION_SECRET tanımlı değil; production için güçlü bir secret tanımlayın.');
} else if (process.env.SESSION_SECRET.trim().length < 32) {
  warnings.push('SESSION_SECRET en az 32 karakter olmalı.');
}

console.log('DepomTakip production environment kontrolü');
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.error(`FAIL: ${e}`);
if (errors.length) process.exit(1);
console.log(`PASS: ${warnings.length} uyarı ile zorunlu production ortam değişkenleri geçerli.`);
