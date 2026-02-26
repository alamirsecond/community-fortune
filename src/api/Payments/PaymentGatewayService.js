import pool from "../../../database.js";
import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';
import axios from 'axios';
import secretManager, { SECRET_KEYS } from '../../Utils/secretManager.js';

class PaymentGatewayService {
   constructor() {
      this.stripe = null;
      this.paypalClient = null;
      this.revolutApi = null;
      this.gateways = new Map(); // Store active gateway configs
      this.ALLOWED_GATEWAYS = new Set(['PAYPAL', 'STRIPE', 'REVOLUT']);
      this.initPromise = null;
   }

   async init() {
      if (this.initPromise) return this.initPromise;
      this.initPromise = this._initGateways();
      return this.initPromise;
   }

   /**
    * Force refresh of all gateway configurations and clients.
    * Clears existing state and re-runs initialization logic.
    * Useful when credentials change at runtime (via admin UI).
    */
   async refresh() {
      // clear existing clients and map
      this.stripe = null;
      this.paypalClient = null;
      this.revolutApi = null;
      this.gateways.clear();
      // allow a new init promise
      this.initPromise = null;
      return this.init();
   }

   async _initGateways() {
      try {
         const gateways = await this.getGatewayConfigurations();

         // Use SANDBOX for development, LIVE for production
         // Default to SANDBOX if not specified
         const environment = process.env.NODE_ENV === 'production' ? 'LIVE' : 'SANDBOX';

         console.log(`Initializing Payment Gateways in ${environment} mode...`);

         // --- STRIPE ---
         const stripeConfig = gateways.find(g => g.gateway === 'STRIPE' && g.environment === environment);
         if (stripeConfig && stripeConfig.is_enabled) {
            try {
               // priority order: DB table value -> secret manager -> env variable
               let stripeSecret = stripeConfig.client_secret || stripeConfig.api_key || '';
               if (!stripeSecret) {
                  try {
                     stripeSecret = await secretManager.getSecret(SECRET_KEYS.STRIPE_SECRET_KEY, {
                        fallbackEnvVar: 'STRIPE_SECRET_KEY',
                        optional: true
                     });
                  } catch {} // we'll handle absence below
               }
               if (stripeSecret) {
                  this.stripe = new Stripe(stripeSecret);
                  const stripeMode = stripeSecret.startsWith('sk_test_') ? 'test' : stripeSecret.startsWith('sk_live_') ? 'live' : 'unknown';
                  console.log(`Stripe secret loaded (mode: ${stripeMode})`);
                  this.gateways.set('STRIPE', stripeConfig);
                  console.log('Stripe initialized successfully.');
               } else {
                  console.warn('Stripe secret key not found in DB/secret manager/env.');
               }
            } catch (err) {
               console.error('Failed to initialize Stripe:', err.message);
            }
         }

         // --- PAYPAL ---
         const paypalConfig = gateways.find(g => g.gateway === 'PAYPAL' && g.environment === environment);
         if (paypalConfig && paypalConfig.is_enabled) {
            try {
               // credentials may live in payment_gateway_settings row
               let clientId = paypalConfig.client_id || '';
               let clientSecret = paypalConfig.client_secret || '';

               if (!clientId || !clientSecret) {
                  try {
                     [clientId, clientSecret] = await Promise.all([
                        secretManager.getSecret(SECRET_KEYS.PAYPAL_CLIENT_ID, { fallbackEnvVar: 'PAYPAL_CLIENT_ID', optional: true }),
                        secretManager.getSecret(SECRET_KEYS.PAYPAL_CLIENT_SECRET, { fallbackEnvVar: 'PAYPAL_CLIENT_SECRET', optional: true })
                     ]);
                  } catch {}
               }

               if (clientId && clientSecret) {
                  const ppEnv = environment === 'LIVE'
                     ? new paypal.core.LiveEnvironment(clientId, clientSecret)
                     : new paypal.core.SandboxEnvironment(clientId, clientSecret);
                  this.paypalClient = new paypal.core.PayPalHttpClient(ppEnv);
                  this.gateways.set('PAYPAL', paypalConfig);
                  console.log('PayPal initialized successfully.');
               } else {
                  console.warn('PayPal credentials not found in DB/secret manager/env.');
               }
            } catch (err) {
               console.error('Failed to initialize PayPal:', err.message);
            }
         }

         // --- REVOLUT ---
         const revolutConfig = gateways.find(g => g.gateway === 'REVOLUT' && g.environment === environment);
         if (revolutConfig && revolutConfig.is_enabled) {
            try {
               // prefer value stored in settings table (api_key)
               let apiKey = revolutConfig.api_key || '';
               if (!apiKey) {
                  try {
                     apiKey = await secretManager.getSecret(SECRET_KEYS.REVOLUT_API_KEY, { optional: true });
                  } catch {}
               }
               if (apiKey) {
                  this.revolutApi = axios.create({
                     baseURL: environment === 'LIVE'
                        ? 'https://b2b.revolut.com/api/1.0'
                        : 'https://sandbox-b2b.revolut.com/api/1.0',
                     headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                     }
                  });
                  this.gateways.set('REVOLUT', revolutConfig);
                  console.log('Revolut initialized successfully.');
               } else {
                  console.warn('Revolut API key not found.');
               }
            } catch (err) {
               console.error('Failed to initialize Revolut:', err.message);
            }
         }

      } catch (error) {
         console.error('CRITICAL: Failed to load payment gateway configurations:', error);
      }
   }

   async getGatewayConfigurations() {
      const connection = await pool.getConnection();
      try {
         const [gateways] = await connection.query(
            `SELECT * FROM payment_gateway_settings`
         );
         return gateways;
      } finally {
         connection.release();
      }
   }

   /**
    * Checks if a specific gateway is enabled in the system.
    * Fetches fresh config from DB to ensure real-time validity.
    * @param {string} gatewayName 
    * @returns {Promise<boolean>}
    */
   async isGatewayEnabled(gatewayName) {
      if (!gatewayName) return false;

      const normalized = gatewayName.toUpperCase();
      if (!this.ALLOWED_GATEWAYS.has(normalized)) return false;

      const environment = process.env.NODE_ENV === 'production' ? 'LIVE' : 'SANDBOX';

      const connection = await pool.getConnection();
      try {
         const [rows] = await connection.query(
            `SELECT is_enabled FROM payment_gateway_settings 
                 WHERE gateway = ? AND environment = ?`,
            [normalized, environment]
         );

         if (rows.length === 0) return false;
         return !!rows[0].is_enabled;
      } finally {
         connection.release();
      }
   }

   /**
    * Validates that the requested gateway is fully available (enabled + initialized).
    * Throws an error if not.
    * @param {string} gatewayName 
    */
   async validateGatewayAvailability(gatewayName) {
      const normalized = String(gatewayName || '').toUpperCase();

      // 1. Check if allowed
      if (!this.ALLOWED_GATEWAYS.has(normalized)) {
         throw new Error(`Unsupported payment gateway: ${normalized}`);
      }

      // 2. Check if enabled in DB
      const isEnabled = await this.isGatewayEnabled(normalized);
      if (!isEnabled) {
         throw new Error(`${normalized} is currently disabled by administrator.`);
      }

      // 3. Check if initialized
      if (normalized === 'STRIPE' && !this.stripe) {
         // Try re-init in case it was just enabled
         await this.init();
         if (!this.stripe) throw new Error('Stripe service is not available (configuration error).');
      }
      if (normalized === 'PAYPAL' && !this.paypalClient) {
         await this.init();
         if (!this.paypalClient) throw new Error('PayPal service is not available (configuration error).');
      }
      if (normalized === 'REVOLUT' && !this.revolutApi) {
         await this.init();
         if (!this.revolutApi) throw new Error('Revolut service is not available (configuration error).');
      }

      return true;
   }

   /**
    * Validates a user payment method against system settings.
    * Ensures functionality is available before processing.
    * @param {string} userId 
    * @param {string} paymentMethodId 
    */
   async validateUserPaymentMethod(userId, paymentMethodId) {
      const connection = await pool.getConnection();
      try {
         const [methods] = await connection.query(
            `SELECT gateway, is_active FROM user_payment_methods
                 WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?)`,
            [paymentMethodId, userId]
         );

         if (!methods.length) {
            throw new Error('Payment method not found.');
         }

         const method = methods[0];
         if (!method.is_active) {
            throw new Error('This payment method is not active.');
         }

         // Check if the system gateway is enabled
         await this.validateGatewayAvailability(method.gateway);

         return method;
      } finally {
         connection.release();
      }
   }

   // --- Accessors ---

   getStripe() {
      if (!this.stripe) throw new Error('Stripe is not initialized');
      return this.stripe;
   }

   getPayPal() {
      if (!this.paypalClient) throw new Error('PayPal is not initialized');
      return this.paypalClient;
   }

   getRevolut() {
      if (!this.revolutApi) throw new Error('Revolut is not initialized');
      return this.revolutApi;
   }

   getGatewayConfig(gatewayName) {
      // synchronous accessor for cached config (current environment only)
      const normalized = String(gatewayName).toUpperCase();
      return this.gateways.get(normalized);
   }

   /**
    * Query the database for the configuration of a specific gateway
    * for the current environment.  This bypasses the in-memory cache and
    * is useful when immediate consistency is required (eg. during webhook
    * handling or right after an admin update).
    * @param {string} gatewayName
    * @returns {Promise<Object|null>}
    */
   async fetchGatewayConfig(gatewayName) {
      if (!gatewayName) return null;
      const normalized = String(gatewayName).toUpperCase();
      const environment = process.env.NODE_ENV === 'production' ? 'LIVE' : 'SANDBOX';
      const connection = await pool.getConnection();
      try {
         const [rows] = await connection.query(
            `SELECT * FROM payment_gateway_settings WHERE gateway = ? AND environment = ?`,
            [normalized, environment]
         );
         return rows[0] || null;
      } finally {
         connection.release();
      }
   }
}

// Export singleton
const paymentGatewayService = new PaymentGatewayService();
// Initialize on start (non-blocking)
paymentGatewayService.init().catch(console.error);

export default paymentGatewayService;
