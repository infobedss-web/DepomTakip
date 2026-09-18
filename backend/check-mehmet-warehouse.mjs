import pg from "pg";

const db = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://bedss:bedss_local@127.0.0.1:55432/bedss",
});

await db.connect();

const user = (
  await db.query(
    `SELECT id,name,email,role,business_id
     FROM users
     WHERE lower(email)=lower($1)`,
    ["mehmet@mavimarket.local"]
  )
).rows[0];

console.log("\nMEHMET:");
console.table([user]);

if (user) {
  const assignments = await db.query(
    `SELECT uwa.*, w.name AS warehouse_name
     FROM user_warehouse_assignments uwa
     LEFT JOIN warehouses w ON w.id=uwa.warehouse_id
     WHERE uwa.user_id=$1`,
    [user.id]
  ).catch(async () => {
    return await db.query(
      `SELECT *
       FROM user_warehouse_assignments
       WHERE user_id=$1`,
      [user.id]
    );
  });

  console.log("\nDEPO ATAMALARI:");
  console.table(assignments.rows);

  const products = await db.query(
    `SELECT id,name,sku,barcode,status,business_id
     FROM products
     WHERE business_id=$1
     ORDER BY name`,
    [user.business_id]
  );

  console.log("\nMAVI MARKET URUNLERI:");
  console.table(products.rows);
}

await db.end();