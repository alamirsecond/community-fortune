import { body } from 'express-validator';

export const validateWebhookSignature = (gateway) => {
  return async (req, res, next) => {
    try {
      let isValid = false;
      
      switch (gateway) {
        case 'stripe':
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          const sig = req.headers['stripe-signature'];
          const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
          
          if (sig && endpointSecret) {
            try {
              req.event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
              isValid = true;
            } catch (err) {
              console.error('Stripe webhook signature verification failed:', err);
            }
          }
          break;
          
        case 'paypal':
          const paypal = require('@paypal/checkout-server-sdk');
          const paypalClient = new paypal.core.PayPalHttpClient(
            new paypal.core.SandboxEnvironment(
              process.env.PAYPAL_CLIENT_ID,
              process.env.PAYPAL_CLIENT_SECRET
            )
          );
          // PayPal webhook verification logic
          break;
          
        case 'revolut':
          const crypto = require('crypto');
          const signature = req.headers['revolut-webhook-signature'];
          const secret = process.env.REVOLUT_WEBHOOK_SECRET;
          
          if (signature && secret) {
            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(JSON.stringify(req.body)).digest('hex');
            isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
          }
          break;
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