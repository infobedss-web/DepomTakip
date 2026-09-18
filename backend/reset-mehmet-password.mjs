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

  const passwordHash = await bcrypt.hash("583174", 12);

  const updated = await db.query(
    `
    UPDATE users
    SET password_hash=$1,
        status='ACTIVE'
    WHERE lower(email)=lower($2)
      AND role='WAREHOUSE_STAFF'
    RETURNING id,name,email,role,status,business_id
    `,
    [passwordHash, "mehmet@mavimarket.local"]
  );

  if (updated.rowCount !== 1) {
    throw new Error("Mehmet depo gorevlisi hesabi bulunamadi.");
  }

  await db.query(
    `DELETE FROM sessions WHERE user_id=$1`,
    [updated.rows[0].id]
  );

  await db.query("COMMIT");

  console.log("");
  console.log("MEHMET SIFRESI SIFIRLANDI");
  console.table(updated.rows);
  console.log("Yeni sifre: 583174");
} catch (e) {
  await db.query("ROLLBACK");
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.end();
}