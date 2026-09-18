import bcrypt from 'bcryptjs';
import { transaction } from './database.js';
export async function seed() {
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(982342)');
    if ((await db.query('SELECT 1 FROM users LIMIT 1')).rowCount) {
      console.log('Veriler mevcut; seed atlandı.');
      return;
    }
    const hash = await bcrypt.hash('BedssDemo!2026', 12);
    const business = (
      await db.query(
        "INSERT INTO businesses(name,tax_number) VALUES('Marmara Lojistik','1234567890') RETURNING id",
      )
    ).rows[0].id;
    const other = (
      await db.query(
        "INSERT INTO businesses(name,tax_number) VALUES('Ege Dağıtım','9876543210') RETURNING id",
      )
    ).rows[0].id;
    const accounts = [
      ['Sistem Yetkilisi', 'admin@bedss.local', 'SUPER_ADMIN', null],
      ['Ayşe Yılmaz', 'bayi@bedss.local', 'OWNER', business],
      ['Mehmet Demir', 'sayim@bedss.local', 'COUNTER', business],
      ['Zeynep Kaya', 'sayim2@bedss.local', 'COUNTER', business],
      ['Selin Aydın', 'bilirkisi@bedss.local', 'AUDITOR', null],
      ['Denetçi', 'misafir@bedss.local', 'GUEST', business],
      ['Ege Yetkilisi', 'ege@bedss.local', 'OWNER', other],
    ];
    const ids: Record<string, string> = {};
    for (const [name, email, role, bid] of accounts) {
      ids[email!] = (
        await db.query(
          "INSERT INTO users(name,email,role,business_id,password_hash,status) VALUES($1,$2,$3,$4,$5,'ACTIVE') RETURNING id",
          [name, email, role, bid, hash],
        )
      ).rows[0].id;
    }
    const wh = (
      await db.query(
        "INSERT INTO warehouses(business_id,name,address) VALUES($1,'İstanbul Ana Depo','Tuzla, İstanbul') RETURNING id",
        [business],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO warehouses(business_id,name,address) VALUES($1,'İzmir Depo','Bornova, İzmir')",
      [other],
    );
    const zone = (
      await db.query(
        "INSERT INTO locations(warehouse_id,name,kind,code) VALUES($1,'A Bölümü','ZONE','LOC-A') RETURNING id",
        [wh],
      )
    ).rows[0].id;
    const rack = (
      await db.query(
        "INSERT INTO locations(warehouse_id,parent_id,name,kind,code) VALUES($1,$2,'A-01 Reyonu','RACK','LOC-A01') RETURNING id",
        [wh, zone],
      )
    ).rows[0].id;
    const rack2 = (
      await db.query(
        "INSERT INTO locations(warehouse_id,parent_id,name,kind,code) VALUES($1,$2,'A-02 Reyonu','RACK','LOC-A02') RETURNING id",
        [wh, zone],
      )
    ).rows[0].id;
    const floor = (
      await db.query(
        "INSERT INTO locations(warehouse_id,parent_id,name,kind,code) VALUES($1,$2,'1. Kat','FLOOR','LOC-A01-K1') RETURNING id",
        [wh, rack],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO locations(warehouse_id,parent_id,name,kind,code) VALUES($1,$2,'Hücre 01','BIN','LOC-A01-K1-B01')",
      [wh, floor],
    );
    await db.query(
      "INSERT INTO locations(warehouse_id,name,kind,code) VALUES($1,'Karantina','QUARANTINE','LOC-Q'),($1,'Geçici Yerleştirme','BUFFER','LOC-BUFFER')",
      [wh],
    );
    const products = [
      [
        'SKU-1001',
        '8690000000012',
        'Endüstriyel Çalışma Eldiveni',
        'İş Güvenliği',
        'Atlas',
        'L / Siyah',
        42,
        75,
        144,
        'A',
      ],
      [
        'SKU-1002',
        '8690000000029',
        'Koruyucu Gözlük',
        'İş Güvenliği',
        'SafePro',
        'Şeffaf',
        85,
        145,
        72,
        'A',
      ],
      [
        'SKU-1003',
        '8690000000036',
        'Ambalaj Bandı',
        'Ambalaj',
        'PackPlus',
        '45 mm',
        18,
        32,
        240,
        'B',
      ],
      ['SKU-1004', '8690000000043', 'Çelik Vida Seti', 'Hırdavat', 'Fixer', 'M8', 65, 110, 36, 'B'],
      [
        'SKU-1005',
        '8690000000050',
        'Reflektörlü Yelek',
        'İş Güvenliği',
        'Atlas',
        'XL / Sarı',
        120,
        210,
        8,
        'C',
      ],
      ['SKU-1006', '8690000000067', 'Streç Film', 'Ambalaj', 'PackPlus', '50 cm', 95, 160, 60, 'C'],
    ];
    for (let i = 0; i < products.length; i++) {
      const [sku, barcode, name, category, brand, variant, cost, price, qty, abc] = products[i];
      const pid = (
        await db.query(
          'INSERT INTO products(business_id,sku,barcode,name,category,brand,variant,purchase_price,sale_price,min_stock,max_stock,abc,supplier) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,12,1000,$10,$11) RETURNING id',
          [
            business,
            sku,
            barcode,
            name,
            category,
            brand,
            variant,
            cost,
            price,
            abc,
            'Demo Tedarik A.Ş.',
          ],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO product_units(product_id,name,multiplier) VALUES($1,'Adet',1),($1,'Koli',12),($1,'Palet',144)",
        [pid],
      );
      await db.query(
        'INSERT INTO stocks(product_id,location_id,physical,lot) VALUES($1,$2,$3,$4)',
        [pid, i < 3 ? rack : rack2, qty, 'LOT-2026-01'],
      );
    }
    const room = (
      await db.query(
        "INSERT INTO rooms(business_id,warehouse_id,name,code,count_type,method,starts_at,ends_at,created_by) VALUES($1,$2,'Eylül Depo Sayımı','BEDSS-DEMO','FULL','HYBRID',now()-interval '1 day',now()+interval '30 days',$3) RETURNING id",
        [business, wh, ids['bayi@bedss.local']],
      )
    ).rows[0].id;
    await db.query(
      'INSERT INTO room_items SELECT $1,s.id,s.physical,p.purchase_price FROM stocks s JOIN products p ON p.id=s.product_id WHERE p.business_id=$2',
      [room, business],
    );
    for (const email of ['sayim@bedss.local', 'sayim2@bedss.local', 'bilirkisi@bedss.local']) {
      await db.query(
        `INSERT INTO user_warehouse_assignments(user_id,warehouse_id)
         VALUES($1,$2)
         ON CONFLICT DO NOTHING`,
        [ids[email], wh],
      );

      for (const loc of [rack, rack2])
        await db.query(
          'INSERT INTO assignments(room_id,user_id,location_id) VALUES($1,$2,$3)',
          [room, ids[email], loc],
        );
    }
    await db.query(
      "INSERT INTO audit_logs(business_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,'DEMO_SEEDED','business',$3)",
      [business, ids['admin@bedss.local'], business],
    );
  });
  console.log('BEDSS demo verileri hazır.');
}

/* BEDSS_DIRECT_SEED_ENTRY */
import { fileURLToPath as __bedssFileURLToPath } from 'node:url';

const __bedssArgvFile = process.argv[1]
  ? process.argv[1].replace(/\\/g, '/').toLowerCase()
  : '';

const __bedssSelfFile = __bedssFileURLToPath(import.meta.url)
  .replace(/\\/g, '/')
  .toLowerCase();

if (__bedssArgvFile === __bedssSelfFile) {
  seed()
    .then(() => {
      console.log('BEDSS_SEED_OK');
    })
    .catch((error) => {
      console.error('BEDSS_SEED_FAILED');
      console.error(error);
      process.exitCode = 1;
    });
}
/* BEDSS_DIRECT_SEED_ENTRY_END */
