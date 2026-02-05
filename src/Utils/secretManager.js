import crypto from "crypto";
import pool from "../../database.js";

const SECRET_CACHE_TTL_MS = parseInt(process.env.SECRET_CACHE_TTL, 10) || 5 * 60 * 1000;
const RAW_ENCRYPTION_KEY = process.env.SECRET_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";

const DERIVED_KEY = RAW_ENCRYPTION_KEY
  ? crypto.createHash("sha256").update(RAW_ENCRYPTION_KEY).digest()
  : null;

const ensureEncryptionKey = () => {
  if (!DERIVED_KEY) {
    throw new Error(
      "Secret encryption key missing. Set SECRET_ENCRYPTION_KEY or ENCRYPTION_KEY with at least 32 characters."
    );
  }
};

const toBuffer = (value) => Buffer.from(value, "base64");

const encryptValue = (plainText) => {
  ensureEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, DERIVED_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    value: encrypted.toString("base64"),
  };
};

const decryptValue = (payload) => {
  ensureEncryptionKey();
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed?.iv || !parsed?.tag || !parsed?.value) {
    throw new Error("Invalid secret payload format");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, DERIVED_KEY, toBuffer(parsed.iv));
  decipher.setAuthTag(toBuffer(parsed.tag));
  const decrypted = Buffer.concat([
    decipher.update(toBuffer(parsed.value)),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

const SECRET_KEYS = Object.freeze({
  JWT: "secret.jwt.primary",
  PAYPAL_CLIENT_ID: "secret.paypal.client_id",
  PAYPAL_CLIENT_SECRET: "secret.paypal.client_secret",
  PAYPAL_WEBHOOK_ID: "secret.paypal.webhook_id",
  STRIPE_PUBLISHABLE_KEY: "secret.stripe.publishable_key",
  STRIPE_SECRET_KEY: "secret.stripe.secret_key",
  STRIPE_WEBHOOK_SECRET: "secret.stripe.webhook_secret",
  STRIPE_CONNECT_CLIENT_ID: "secret.stripe.connect_client_id",
  REVOLUT_API_KEY: "secret.revolut.api_key",
  REVOLUT_WEBHOOK_SECRET: "secret.revolut.webhook_secret",
  REVOLUT_DEFAULT_ACCOUNT_ID: "secret.revolut.default_account_id",
});

class SecretManager {
  constructor() {
    this.cache = new Map();
  }

  #cacheKey(key) {
    return key;
  }

  #readFromCache(key) {
    const entry = this.cache.get(this.#cacheKey(key));
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.loadedAt > SECRET_CACHE_TTL_MS) {
      this.cache.delete(this.#cacheKey(key));
      return null;
    }

    return entry.value;
  }

  #writeToCache(key, value) {
    this.cache.set(this.#cacheKey(key), {
      value,
      loadedAt: Date.now(),
    });
  }

  clearCache(key) {
    if (key) {
      this.cache.delete(this.#cacheKey(key));
      return;
    }
    this.cache.clear();
  }

  async #fetchSecretRow(key) {
    const [rows] = await pool.query(
      `SELECT setting_key, setting_value, updated_at, BIN_TO_UUID(updated_by) AS updatedBy
       FROM system_settings
       WHERE setting_key = ?`,
      [key]
    );
    return rows[0] || null;
  }

  async getSecret(key, options = {}) {
    const { fallbackEnvVar, optional = false, forceRefresh = false } = options;

    if (!forceRefresh) {
      const cachedValue = this.#readFromCache(key);
      if (cachedValue !== null && cachedValue !== undefined) {
        return cachedValue;
      }
    }

    const row = await this.#fetchSecretRow(key);
    if (row?.setting_value) {
      const decrypted = decryptValue(row.setting_value);
      this.#writeToCache(key, decrypted);
      return decrypted;
    }

    if (fallbackEnvVar && process.env[fallbackEnvVar]) {
      const fallback = process.env[fallbackEnvVar];
      this.#writeToCache(key, fallback);
      return fallback;
    }

    if (optional) {
      return null;
    }

    throw new Error(`Secret '${key}' is not configured`);
  }

  async setSecret(key, value, options = {}) {
    if (!value) {
      throw new Error("Secret value cannot be empty");
    }

    const { description = `Encrypted secret for ${key}`, category = "SECURITY", updatedBy = null } = options;

    const payload = encryptValue(value);
    await pool.query(
      `INSERT INTO system_settings (id, setting_key, setting_value, description, setting_type, category, is_public, updated_by)
       VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, 'JSON', ?, FALSE, UUID_TO_BIN(?))
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         description = VALUES(description),
         setting_type = VALUES(setting_type),
         category = VALUES(category),
         is_public = VALUES(is_public),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(payload), description, category, updatedBy]
    );

    this.#writeToCache(key, String(value));
  }

  async deleteSecret(key) {
    await pool.query(`DELETE FROM system_settings WHERE setting_key = ?`, [key]);
    this.clearCache(key);
  }

  async getSecretStatus(key) {
    const row = await this.#fetchSecretRow(key);
    return {
      key,
      isConfigured: !!row,
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updatedBy || null,
    };
  }

  async getBulkStatuses(keys = []) {
    if (!keys.length) {
      return [];
    }

    const placeholders = keys.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT setting_key, updated_at, BIN_TO_UUID(updated_by) AS updatedBy
       FROM system_settings
       WHERE setting_key IN (${placeholders})`,
      keys
    );

    const map = new Map(rows.map((row) => [row.setting_key, row]));

    return keys.map((key) => {
      const row = map.get(key);
      return {
        key,
        isConfigured: Boolean(row),
        updatedAt: row?.updated_at || null,
        updatedBy: row?.updatedBy || null,
      };
    });
  }
}

const secretManager = new SecretManager();

export { secretManager as default, SECRET_KEYS };
