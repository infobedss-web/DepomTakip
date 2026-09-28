import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const errors = [];
const warnings = [];
const pass = [];

function ok(name, condition, detail='') {
  if (condition) pass.push(`${name}${detail ? ` — ${detail}` : ''}`);
  else errors.push(name);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const rootPkg = JSON.parse(read('package.json'));
const apiPkg = JSON.parse(read('backend/package.json'));
const webPkg = JSON.parse(read('web/package.json'));
ok('Root paket adı DepomTakip', rootPkg.name === 'depomtakip');
ok('Sürüm 2.6.0', rootPkg.version === '2.6.0');
ok('Backend paket adı', apiPkg.name === '@depomtakip/api');
ok('Web paket adı', webPkg.name === '@depomtakip/web');

const app = read('backend/src/app.ts');
ok('Health application=DepomTakip', /application:\s*['"]DepomTakip['"]/.test(app));
ok('Health database=PostgreSQL', /database:\s*['"]PostgreSQL['"]/.test(app));

const db = read('backend/src/database.ts');
ok('Yerel varsayılan DB DepomTakip', db.includes('/depomtakip'));

const migrationDir = path.join(root, 'database');
const migrations = fs.readdirSync(migrationDir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
const versions = new Map();
for (const file of migrations) {
  const v = Number(file.split('_')[0]);
  versions.set(v, [...(versions.get(v) || []), file]);
  const bytes = fs.readFileSync(path.join(migrationDir, file));
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    errors.push(`BOM bulunan migration: ${file}`);
  }
}
for (const [v, files] of versions) {
  if (files.length > 1) warnings.push(`Aynı migration numarası ${v}: ${files.join(', ')}`);
}
ok('Migration dosyalarında UTF-8 BOM yok', !errors.some(e => e.startsWith('BOM bulunan')));

const seed = read('backend/src/seed.ts');
ok('Demo hesapları @depomtakip.local', seed.includes('@depomtakip.local'));
ok('Demo oda kodu DT-DEMO', seed.includes("'DT-DEMO'"));
ok('Demo parola DepomTakip!2026', seed.includes('DepomTakip!2026'));

const offline = read('web/src/offline.ts');
ok('Yeni cihaz anahtarı depomtakip_device_id', offline.includes('depomtakip_device_id'));
ok('Eski cihaz anahtarı için geriye uyumluluk', offline.includes('bedss_device_id'));

const rootGitignore = read('.gitignore');
for (const token of ['.env', 'node_modules', 'backend/dist', 'web/dist']) {
  if (!rootGitignore.includes(token)) warnings.push(`.gitignore kontrolü: ${token} açıkça görünmüyor`);
}

console.log('\nDepomTakip V2.6 — Production Preflight\n');
for (const p of pass) console.log(`PASS  ${p}`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(`\nSonuç: ${pass.length} PASS, ${warnings.length} WARN, ${errors.length} FAIL`);
if (errors.length) process.exit(1);
