import axios from 'axios';
import crypto from 'crypto';
import secretManager, { SECRET_KEYS } from '../src/Utils/secretManager.js';
import pool from '../database.js';

const BASE_URL = 'http://localhost:5000/api/payments/webhook'; // Adjust port if needed

async function testWebhooks() {
   console.log("Starting Webhook Verification...");
   console.log("--------------------------------");

   try {
      // Prepare Secrets
      const stripeSecret = await secretManager.getSecret(SECRET_KEYS.STRIPE_WEBHOOK_SECRET);
      const paypalWebhookId = await secretManager.getSecret(SECRET_KEYS.PAYPAL_WEBHOOK_ID);
      const revolutSecret = await secretManager.getSecret(SECRET_KEYS.REVOLUT_WEBHOOK_SECRET);

      console.log("Secrets loaded (if configured).");

      if (stripeSecret) await testStripeWebhook(stripeSecret);
      else console.log("⚠️  Stripe Webhook Secret missing, skipping...");

      if (paypalWebhookId) await testPaypalWebhook(paypalWebhookId); // PayPal validation is complex (headers + remote cert), might need mocking 'payment_middleware.js' logic or using a simulator
      else console.log("⚠️  PayPal Webhook ID missing, skipping...");

      if (revolutSecret) await testRevolutWebhook(revolutSecret);
      else console.log("⚠️  Revolut Webhook Secret missing, skipping...");

   } catch (error) {
      console.error("Error during webhook testing:", error);
   } finally {
      await pool.end();
   }
}

async function testStripeWebhook(secret) {
   console.log("\nTesting Stripe Webhook...");
   const payload = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_123', amount: 1000, currency: 'gbp' } }
   };
   const payloadString = JSON.stringify(payload);
   const timestamp = Math.floor(Date.now() / 1000);
   const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payloadString}`)
      .digest('hex');

   const stripeSignature = `t=${timestamp},v1=${signature}`;

   try {
      const res = await axios.post(`${BASE_URL}/stripe`, payload, {
         headers: { 'stripe-signature': stripeSignature }
      });
      console.log(`✅ Stripe Webhook: ${res.status} ${res.statusText}`);
   } catch (error) {
      console.error(`❌ Stripe Webhook Failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
   }
}

async function testRevolutWebhook(secret) {
   console.log("\nTesting Revolut Webhook...");
   const payload = {
      event: 'ORDER_COMPLETED',
      data: { id: 'ord_test_123', state: 'COMPLETED' }
   };
   const payloadString = JSON.stringify(payload);
   const timestamp = Date.now();
   const signature = crypto
      .createHmac('sha256', secret)
      .update(`v1.${timestamp}.${payloadString}`)
      .digest('hex');

   const revolutSignature = `v1=${signature}`;

   try {
      const res = await axios.post(`${BASE_URL}/revolut`, payload, {
         headers: {
            'Revolut-Request-Timestamp': timestamp,
            'Revolut-Signature': revolutSignature
         }
      });
      console.log(`✅ Revolut Webhook: ${res.status} ${res.statusText}`);
   } catch (error) {
      console.error(`❌ Revolut Webhook Failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
   }
}

async function testPaypalWebhook(webhookId) {
   console.log("\nTesting PayPal Webhook...");
   // PayPal requires fetching certificates from PayPal to verify signature. 
   // Simulating a VALID PayPal webhook locally is difficult without mocking the 'paypal-rest-sdk' or 'verify_webhook_signature' logic on the server.
   // For now, we will just send a payload and expect a 400 or 500 if the signature check fails (which proves the endpoint is listening and validating).
   // If we get 404, that's bad.

   const payload = {
      id: 'evt_test_paypal',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_test_123' }
   };

   try {
      await axios.post(`${BASE_URL}/paypal`, payload, {
         headers: {
            'paypal-transmission-id': 'test-id',
            'paypal-transmission-time': new Date().toISOString(),
            'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-URL',
            'paypal-auth-algo': 'SHA256withRSA',
            'paypal-transmission-sig': 'INVALID-SIG-FOR-TESTING'
         }
      });
      // We actually EXPECT this to fail validation if logic is correct, unless we mock the validator.
      console.log("❓ PayPal Webhook: Accepted (Unexpected if signature validation is active)");
   } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 401 || error.response?.status === 500) {
         console.log(`✅ PayPal Webhook reached endpoint (Rejected as expected due to invalid signature): ${error.response.status}`);
      } else {
         console.error(`❌ PayPal Webhook Error: ${error.response?.status || error.message}`);
      }
   }
}

testWebhooks();
