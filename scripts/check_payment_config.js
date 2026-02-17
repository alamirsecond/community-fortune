import pool from '../database.js';
import { SECRET_KEYS } from '../src/Utils/secretManager.js';

async function checkConfig() {
   console.log("Checking Payment Configuration...");
   const connection = await pool.getConnection();
   try {
      // Check Gateway Settings
      console.log("\n--- Gateway Settings (payment_gateway_settings) ---");
      const [gateways] = await connection.query("SELECT * FROM payment_gateway_settings");
      if (gateways.length === 0) {
         console.log("No gateways configured in 'payment_gateway_settings'.");
      } else {
         console.table(gateways);
      }

      // Check Secrets (system_settings)
      console.log("\n--- Secrets (system_settings) ---");
      // We only check if the key exists, not the value to avoid leaking secrets in logs
      const keysToCheck = Object.values(SECRET_KEYS);
      // Using IN clause with array requires nested array for mysql2
      const [secrets] = await connection.query(
         "SELECT setting_key, updated_at, BIN_TO_UUID(updated_by) as updated_by FROM system_settings WHERE setting_key IN (?)",
         [keysToCheck]
      );

      const foundKeys = new Set(secrets.map(s => s.setting_key));

      keysToCheck.forEach(key => {
         if (foundKeys.has(key)) {
            console.log(`[OK] ${key} is present.`);
         } else {
            console.log(`[MISSING] ${key}`);
         }
      });

   } catch (err) {
      console.error("Error checking config:", err);
   } finally {
      connection.release();
      pool.end();
      process.exit();
   }
}

checkConfig();
