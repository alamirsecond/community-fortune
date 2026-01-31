// config/paypal.js
import paypal from '@paypal/checkout-server-sdk';

// PayPal Environment Configuration
const configurePayPal = () => {
  const environment = process.env.NODE_ENV === 'production' ? 'LIVE' : 'SANDBOX';
  
  // You can also fetch settings from database
  const clientId = environment === 'LIVE' 
    ? process.env.PAYPAL_LIVE_CLIENT_ID 
    : process.env.PAYPAL_SANDBOX_CLIENT_ID;
  
  const clientSecret = environment === 'LIVE'
    ? process.env.PAYPAL_LIVE_CLIENT_SECRET
    : process.env.PAYPAL_SANDBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  let paypalEnvironment;
  if (environment === 'LIVE') {
    paypalEnvironment = new paypal.core.LiveEnvironment(clientId, clientSecret);
  } else {
    paypalEnvironment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
  }

  return new paypal.core.PayPalHttpClient(paypalEnvironment);
};

export { configurePayPal, paypal };