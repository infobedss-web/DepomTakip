import pg from "pg";
import bcrypt from "bcryptjs";

const db = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://bedss:bedss_local@127.0.0.1:55432/bedss",
});

await db.connect();

try {
  await db.query("BEGIN");

  const found = await db.query(
    `SELECT id,name,email,role,status,business_id
     FROM users
     WHERE lower(email)=lower($1)
     FOR UPDATE`,
    ["sayim@bedss.local"]
  );

  if (found.rowCount !== 1) {
    throw new Error("Mehmet Demir hesabi bulunamadi.");
  }

  const user = found.rows[0];
  const passwordHash = await bcrypt.hash("583174", 12);

  const updated = await db.query(
    `UPDATE users
       SET role='WAREHOUSE_STAFF',
           password_hash=$1,
           status='ACTIVE'
     WHERE id=$2
     RETURNING id,name,email,role,status,business_id`,
    [passwordHash, user.id]
  );

  await db.query(
    `DELETE FROM sessions WHERE user_id=$1`,
    [user.id]
  );

  await db.query("COMMIT");

  console.log("");
  console.log("MEHMET HESABI GUNCELLENDI");
  console.table(updated.rows);
  console.log("Yeni sifre: 583174");
} catch (e) {
  await db.query("ROLLBACK");
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.end();
}