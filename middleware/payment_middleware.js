import { body } from 'express-validator';
import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';
import crypto from 'crypto';
import secretManager, { SECRET_KEYS } from '../src/Utils/secretManager.js';
import paymentGatewayService from '../src/api/Payments/PaymentGatewayService.js';

export const validateWebhookSignature = (gateway) => {
  return async (req, res, next) => {
    try {
      let isValid = false;

      switch (gateway) {
        case 'stripe': {
          const signature = req.headers['stripe-signature'];
          if (!signature) {
            break;
          }

          // try to pull credentials from DB first
          const gatewayCfg = await paymentGatewayService.fetchGatewayConfig('STRIPE');
          let stripeSecret = gatewayCfg?.client_secret || gatewayCfg?.api_key || '';
          let webhookSecret = gatewayCfg?.webhook_secret || '';

          // fall back to file/env/secretManager if not defined in DB
          if (!stripeSecret || !webhookSecret) {
            // load from config file for backwards compatibility
            const cfg = (await import('../src/config/payments.js')).default;
            stripeSecret = stripeSecret || cfg.stripe.secretKey;
            webhookSecret = webhookSecret || cfg.stripe.webhookSecret;

            if (!stripeSecret || !webhookSecret) {
              try {
                [stripeSecret, webhookSecret] = await Promise.all([
                  secretManager.getSecret(SECRET_KEYS.STRIPE_SECRET_KEY, { fallbackEnvVar: 'STRIPE_SECRET_KEY', optional: true }),
                  secretManager.getSecret(SECRET_KEYS.STRIPE_WEBHOOK_SECRET, { fallbackEnvVar: 'STRIPE_WEBHOOK_SECRET', optional: true })
                ]);
              } catch (secretError) {
                console.error('Stripe secret retrieval error:', secretError.message);
                return res.status(500).json({ success: false, error: 'Stripe secrets are not configured' });
              }
            }
          }

          try {
            const stripe = new Stripe(stripeSecret);
            const rawPayload = req.rawBody || JSON.stringify(req.body);
            req.event = stripe.webhooks.constructEvent(rawPayload, signature, webhookSecret);
            isValid = true;
          } catch (err) {
            console.error('Stripe webhook signature verification failed:', err);
          }
          break;
        }

        case 'paypal': {
          const requiredHeaders = [
            'paypal-transmission-id',
            'paypal-transmission-time',
            'paypal-transmission-sig',
            'paypal-cert-url',
            'paypal-auth-algo'
          ];

          const missingHeader = requiredHeaders.find((header) => !req.headers[header]);
          if (missingHeader) {
            console.warn(`Missing PayPal webhook header: ${missingHeader}`);
            break;
          }

          // try database first
          const ppCfg = await paymentGatewayService.fetchGatewayConfig('PAYPAL');
          let clientId = ppCfg?.client_id || '';
          let clientSecret = ppCfg?.client_secret || '';
          let webhookId = ppCfg?.webhook_secret || ''; // configurable field for webhook id

          // fall back to file or secret manager
          if (!clientId || !clientSecret || !webhookId) {
            const cfg = (await import('../src/config/payments.js')).default;
            clientId = clientId || cfg.paypal.clientId;
            clientSecret = clientSecret || cfg.paypal.clientSecret;
            webhookId = webhookId || cfg.paypal.webhookId;

            if (!clientId || !clientSecret || !webhookId) {
              try {
                [clientId, clientSecret, webhookId] = await Promise.all([
                  secretManager.getSecret(SECRET_KEYS.PAYPAL_CLIENT_ID, { fallbackEnvVar: 'PAYPAL_CLIENT_ID', optional: true }),
                  secretManager.getSecret(SECRET_KEYS.PAYPAL_CLIENT_SECRET, { fallbackEnvVar: 'PAYPAL_CLIENT_SECRET', optional: true }),
                  secretManager.getSecret(SECRET_KEYS.PAYPAL_WEBHOOK_ID, { fallbackEnvVar: 'PAYPAL_WEBHOOK_ID', optional: true })
                ]);
              } catch (secretError) {
                console.error('PayPal secret retrieval error:', secretError.message);
                return res.status(500).json({ success: false, error: 'PayPal secrets are not configured' });
              }
            }
          }

          const environment = process.env.NODE_ENV === 'production'
            ? new paypal.core.LiveEnvironment(clientId, clientSecret)
            : new paypal.core.SandboxEnvironment(clientId, clientSecret);
          const paypalClient = new paypal.core.PayPalHttpClient(environment);

          const verifyRequest = new paypal.notifications.VerifyWebhookSignatureRequest();
          verifyRequest.requestBody({
            auth_algo: req.headers['paypal-auth-algo'],
            cert_url: req.headers['paypal-cert-url'],
            transmission_id: req.headers['paypal-transmission-id'],
            transmission_sig: req.headers['paypal-transmission-sig'],
            transmission_time: req.headers['paypal-transmission-time'],
            webhook_id: webhookId,
            webhook_event: req.body
          });

          try {
            const response = await paypalClient.execute(verifyRequest);
            if (response.result?.verification_status === 'SUCCESS') {
              req.event = req.body;
              isValid = true;
            }
          } catch (error) {
            console.error('PayPal webhook verification failed:', error.message);
          }
          break;
        }

        case 'revolut': {
          const signature = req.headers['revolut-webhook-signature'];
          if (!signature) {
            break;
          }

          // check DB row first
          const revCfg = await paymentGatewayService.fetchGatewayConfig('REVOLUT');
          let webhookSecret = revCfg?.webhook_secret || '';

          if (!webhookSecret) {
            // fall back to config file
            const cfg = (await import('../src/config/payments.js')).default;
            webhookSecret = cfg.revolut.webhookSecret;

            if (!webhookSecret) {
              try {
                webhookSecret = await secretManager.getSecret(SECRET_KEYS.REVOLUT_WEBHOOK_SECRET, {
                  fallbackEnvVar: 'REVOLUT_WEBHOOK_SECRET',
                  optional: true
                });
              } catch (secretError) {
                console.error('Revolut secret retrieval error:', secretError.message);
                return res.status(500).json({ success: false, error: 'Revolut secrets are not configured' });
              }
            }
          }

          const payload = req.rawBody || JSON.stringify(req.body);
          const digest = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

          if (signature.length === digest.length) {
            const signatureBuffer = Buffer.from(signature, 'hex');
            const digestBuffer = Buffer.from(digest, 'hex');
            isValid = crypto.timingSafeEqual(signatureBuffer, digestBuffer);
          }
          break;
        }
      }
      
      if (isValid) {
        next();
      } else {
        res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }
    } catch (error) {
      console.error('Webhook signature validation error:', error);
      res.status(500).json({ success: false, error: 'Webhook validation failed' });
    }
  };
};

export const checkPaymentLimits = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, type } = req.body;
    
    const pool = await getConnection();
    const [limits] = await pool.query(
      `SELECT * FROM transaction_limits WHERE user_id = UUID_TO_BIN(?)`,
      [userId]
    );
    
    if (limits.length) {
      const limit = limits[0];
      const today = new Date().toISOString().split('T')[0];
      
      if (type === 'deposit') {
        if (amount > limit.max_single_deposit) {
          return res.status(400).json({ 
            success: false, 
            error: `Amount exceeds single deposit limit of ${limit.max_single_deposit}` 
          });
        }
        
        if (amount + limit.daily_deposit_used > limit.daily_deposit_limit) {
          return res.status(400).json({ 
            success: false, 
            error: `Amount would exceed daily deposit limit of ${limit.daily_deposit_limit}` 
          });
        }
      }
      
      if (type === 'withdrawal') {
        if (amount > limit.max_single_withdrawal) {
          return res.status(400).json({ 
            success: false, 
            error: `Amount exceeds single withdrawal limit of ${limit.max_single_withdrawal}` 
          });
        }
        
        if (amount + limit.daily_withdrawal_used > limit.daily_withdrawal_limit) {
          return res.status(400).json({ 
            success: false, 
            error: `Amount would exceed daily withdrawal limit of ${limit.daily_withdrawal_limit}` 
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Check payment limits error:', error);
    res.status(500).json({ success: false, error: 'Payment limit check failed' });
  }
};

export const checkKYCStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type } = req.body;
    
    if (type === 'withdrawal' && process.env.KYC_REQUIRED_FOR_WITHDRAWAL === 'true') {
      const pool = await getConnection();
      const [user] = await pool.query(
        `SELECT kyc_status FROM users WHERE id = UUID_TO_BIN(?)`,
        [userId]
      );
      
      if (user.length && user[0].kyc_status !== 'VERIFIED') {
        return res.status(400).json({ 
          success: false, 
          error: 'KYC verification required for withdrawals' 
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Check KYC status error:', error);
    res.status(500).json({ success: false, error: 'KYC check failed' });
  }
};