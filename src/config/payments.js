import dotenv from 'dotenv';

// central configuration for payment gateways
// This file serves as a fallback location for secrets and identifiers,
// sourcing values from environment variables.  In production the
// preferred mechanism is the "payment_gateway_settings" database table
// which is managed via the admin UI.  The application will attempt to
// read credentials from the DB first and only fall back to these values
// (or to the secret manager) when no database entry exists.
// For local development you can still populate the .env or hard‑code
// values here, but changes made in the UI will override them once the
// gateway service refreshes.

dotenv.config();

export default {
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  },
  revolut: {
    webhookSecret: process.env.REVOLUT_WEBHOOK_SECRET || '',
  },
};
