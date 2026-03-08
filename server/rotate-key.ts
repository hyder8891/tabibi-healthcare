import crypto from "crypto";
import { Pool } from "@neondatabase/serverless";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

const OLD_KEY = "f73322312daa5f35599e45a61dd406150c34a3192aa54b5c18509dbf9f21baf5";

function deriveKey(raw: string): Buffer {
  return crypto.createHash("sha256").update(raw).digest();
}

function decryptWithKey(encryptedText: string, key: Buffer): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3 || parts[0].length !== 32 || parts[1].length !== 32) {
    throw new Error("Malformed encrypted data");
  }
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptWithKey(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

function isEncrypted(text: string): boolean {
  const parts = text.split(":");
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

async function rotateKeys() {
  const newKeyRaw = process.env.ENCRYPTION_KEY;
  if (!newKeyRaw) {
    console.error("ENCRYPTION_KEY environment variable must be set to the NEW key value");
    process.exit(1);
  }

  if (newKeyRaw === OLD_KEY) {
    console.error("The new ENCRYPTION_KEY is the same as the old compromised key. Please set a new key first.");
    process.exit(1);
  }

  const oldKey = deriveKey(OLD_KEY);
  const newKey = deriveKey(newKeyRaw);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  const client = await pool.connect();

  try {
    const encryptedOrderFields = [
      "medicine_name", "medicine_dosage", "patient_name", "patient_phone",
      "notes", "delivery_address", "pharmacy_phone", "pharmacy_address", "medicine_frequency",
    ];

    const ordersResult = await client.query("SELECT id, " + encryptedOrderFields.join(", ") + " FROM orders");
    console.log(`Found ${ordersResult.rows.length} orders to re-encrypt`);

    for (const row of ordersResult.rows) {
      const updates: Record<string, string> = {};
      for (const field of encryptedOrderFields) {
        const value = row[field];
        if (value && isEncrypted(value)) {
          try {
            const plaintext = decryptWithKey(value, oldKey);
            updates[field] = encryptWithKey(plaintext, newKey);
          } catch (e) {
            console.warn(`  Warning: Could not decrypt orders.${field} for id=${row.id}, skipping`);
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map((f, i) => `${f} = $${i + 2}`);
        const values = [row.id, ...Object.values(updates)];
        await client.query(`UPDATE orders SET ${setClauses.join(", ")} WHERE id = $1`, values);
        console.log(`  Re-encrypted order ${row.id} (${Object.keys(updates).length} fields)`);
      }
    }

    const profilesResult = await client.query("SELECT id, last_conditions FROM health_profiles WHERE last_conditions IS NOT NULL");
    console.log(`Found ${profilesResult.rows.length} health profiles to re-encrypt`);

    for (const row of profilesResult.rows) {
      const value = row.last_conditions;
      if (value && isEncrypted(value)) {
        try {
          const plaintext = decryptWithKey(value, oldKey);
          const reEncrypted = encryptWithKey(plaintext, newKey);
          await client.query("UPDATE health_profiles SET last_conditions = $1 WHERE id = $2", [reEncrypted, row.id]);
          console.log(`  Re-encrypted health_profile ${row.id}`);
        } catch (e) {
          console.warn(`  Warning: Could not decrypt health_profiles.last_conditions for id=${row.id}, skipping`);
        }
      }
    }

    console.log("\nKey rotation complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

rotateKeys().catch((err) => {
  console.error("Key rotation failed:", err);
  process.exit(1);
});
