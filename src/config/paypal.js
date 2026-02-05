// config/paypal.js
import paypal from '@paypal/checkout-server-sdk';
import secretManager, { SECRET_KEYS } from '../Utils/secretManager.js';

// PayPal Environment Configuration
const configurePayPal = async () => {
  const environment = process.env.NODE_ENV === 'production' ? 'LIVE' : 'SANDBOX';

  const [clientId, clientSecret] = await Promise.all([
    secretManager.getSecret(SECRET_KEYS.PAYPAL_CLIENT_ID, { fallbackEnvVar: 'PAYPAL_CLIENT_ID' }),
    secretManager.getSecret(SECRET_KEYS.PAYPAL_CLIENT_SECRET, { fallbackEnvVar: 'PAYPAL_CLIENT_SECRET' })
  ]);

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  const paypalEnvironment = environment === 'LIVE'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);

  return new paypal.core.PayPalHttpClient(paypalEnvironment);
};

export { configurePayPal, paypal };