import pool from "../../database.js";

const DEFAULT_CACHE_TTL_MS = parseInt(process.env.SYSTEM_SETTINGS_CACHE_TTL, 10) || 30000;

export const DEFAULT_MAINTENANCE_SETTINGS = {
  maintenance_mode: false,
  allowed_ips: [],
  maintenance_message: "System is under maintenance. Please try again later.",
  estimated_duration: "2 hours"
};

export const NOTIFICATION_DEFINITIONS = {
  welcome_email: { defaultEnabled: true, mandatory: true },
  competition_entry_confirmation: { defaultEnabled: true, mandatory: false },
  winner_notification: { defaultEnabled: true, mandatory: true },
  marketing_emails: { defaultEnabled: false, mandatory: false },
  deposit_notification: { defaultEnabled: true, mandatory: false },
  withdrawal_notification: { defaultEnabled: true, mandatory: false },
  kyc_status_update: { defaultEnabled: true, mandatory: false },
  referral_reward: { defaultEnabled: true, mandatory: false },
  password_reset: { defaultEnabled: true, mandatory: true },
  otp: { defaultEnabled: true, mandatory: true }
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
};

const toJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Failed to parse JSON system setting", error.message);
    return fallback;
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeIp = (ip) => {
  if (!ip) {
    return "";
  }

  let normalized = ip.trim();
  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.substring(7);
  }

  if (normalized === "::1") {
    return "127.0.0.1";
  }

  return normalized;
};

export const resolveClientIp = (req) => {
  if (!req) {
    return "";
  }

  const header = req.headers?.["x-forwarded-for"];
  if (header) {
    const forwarded = header.split(",")[0];
    return normalizeIp(forwarded);
  }

  const directIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
  return normalizeIp(directIp);
};

export const isIpAllowed = (ip, allowedIps = []) => {
  if (!ip || !Array.isArray(allowedIps) || allowedIps.length === 0) {
    return false;
  }

  const normalizedIp = normalizeIp(ip);

  return allowedIps.some((candidate) => {
    if (!candidate) {
      return false;
    }

    const normalizedCandidate = normalizeIp(candidate);
    if (normalizedCandidate === "*") {
      return true;
    }

    if (normalizedCandidate.includes("*")) {
      const pattern = new RegExp(
        `^${escapeRegex(normalizedCandidate).replace(/\\\*/g, ".*")}$`
      );
      return pattern.test(normalizedIp);
    }

    return normalizedCandidate === normalizedIp;
  });
};

class SystemSettingsCache {
  constructor() {
    this.cache = new Map();
    this.loadedAt = 0;
    this.loadingPromise = null;
    this.ttlMs = DEFAULT_CACHE_TTL_MS;
  }

  async loadAll() {
    const [rows] = await pool.query(
      "SELECT setting_key AS settingKey, setting_value AS settingValue FROM system_settings"
    );

    const nextCache = new Map();
    rows.forEach((row) => {
      nextCache.set(row.settingKey, row.settingValue);
    });

    this.cache = nextCache;
    this.loadedAt = Date.now();
    return this.cache;
  }

  async ensureCache() {
    const now = Date.now();
    if (this.loadingPromise) {
      await this.loadingPromise;
      return this.cache;
    }

    if (this.cache.size === 0 || now - this.loadedAt > this.ttlMs) {
      this.loadingPromise = this.loadAll();
      try {
        await this.loadingPromise;
      } finally {
        this.loadingPromise = null;
      }
    }

    return this.cache;
  }

  invalidate() {
    this.cache.clear();
    this.loadedAt = 0;
  }

  async getValue(key) {
    const cache = await this.ensureCache();
    if (!cache.has(key)) {
      return undefined;
    }
    return cache.get(key);
  }

  async getBoolean(key, fallback = false) {
    const value = await this.getValue(key);
    return toBoolean(value, fallback);
  }

  async getJson(key, fallback) {
    const value = await this.getValue(key);
    return toJson(value, fallback);
  }

  async getString(key, fallback = "") {
    const value = await this.getValue(key);
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    return String(value);
  }

  async getSettingsByPrefix(prefix) {
    const cache = await this.ensureCache();
    const entries = [];
    cache.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        entries.push({ key, value });
      }
    });
    return entries;
  }

  async getMaintenanceSettings() {
    const [mode, allowedIps, message, estimatedDuration] = await Promise.all([
      this.getBoolean("maintenance_mode", DEFAULT_MAINTENANCE_SETTINGS.maintenance_mode),
      this.getJson("maintenance_allowed_ips", DEFAULT_MAINTENANCE_SETTINGS.allowed_ips),
      this.getString("maintenance_message", DEFAULT_MAINTENANCE_SETTINGS.maintenance_message),
      this.getString(
        "maintenance_estimated_duration",
        DEFAULT_MAINTENANCE_SETTINGS.estimated_duration
      )
    ]);

    return {
      maintenance_mode: mode,
      allowed_ips: Array.isArray(allowedIps) ? allowedIps : [],
      maintenance_message: message,
      estimated_duration: estimatedDuration
    };
  }

  async getNotificationPreferences() {
    const preferences = {};

    await Promise.all(
      Object.entries(NOTIFICATION_DEFINITIONS).map(async ([key, meta]) => {
        preferences[key] = await this.getBoolean(
          `notification_user_${key}`,
          meta.defaultEnabled
        );
      })
    );

    return preferences;
  }

  async isNotificationEnabled(key) {
    const definition = NOTIFICATION_DEFINITIONS[key];
    const fallback = definition ? definition.defaultEnabled : true;
    return this.getBoolean(`notification_user_${key}`, fallback);
  }

  async evaluateMaintenanceAccess(req, userRole) {
    const settings = await this.getMaintenanceSettings();
    if (!settings.maintenance_mode) {
      return { allowed: true, settings };
    }

    const privileged = userRole && ["SUPERADMIN", "ADMIN"].includes(userRole);
    if (privileged) {
      return { allowed: true, settings };
    }

    const clientIp = resolveClientIp(req);
    if (isIpAllowed(clientIp, settings.allowed_ips)) {
      return { allowed: true, settings };
    }

    return { allowed: false, settings, clientIp };
  }
}

const systemSettingsCache = new SystemSettingsCache();

export default systemSettingsCache;
