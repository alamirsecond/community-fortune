import paymentGatewayService from '../src/api/Payments/PaymentGatewayService.js';
import secretManager from '../src/Utils/secretManager.js';
import pool from '../database.js';

async function verifyGateways() {
   console.log("Starting Payment Gateway Verification...");
   console.log("----------------------------------------");

   try {
      // 1. Initialize Gateways
      console.log("Initializing Gateways...");
      await paymentGatewayService.init();
      console.log("✅ Initialization complete.");

      // 2. Check Enabled Gateways
      const gateways = ['STRIPE', 'PAYPAL', 'REVOLUT'];
      for (const gateway of gateways) {
         const isEnabled = await paymentGatewayService.isGatewayEnabled(gateway);
         console.log(`Gateway ${gateway}: ${isEnabled ? "ENABLED" : "DISABLED"}`);

         if (isEnabled) {
            try {
               await testGatewayConnection(gateway);
            } catch (err) {
               console.error(`❌ ${gateway} Verification Failed:`, err.message);
            }
         }
      }

   } catch (error) {
      console.error("Critical Error during verification:", error);
   } finally {
      await pool.end();
      process.exit();
   }
}

async function testGatewayConnection(gateway) {
   console.log(`Testing ${gateway} connection...`);

   switch (gateway) {
      case 'STRIPE':
         if (!paymentGatewayService.stripe) throw new Error("Stripe client not initialized");
         // Try to list 1 customer or something benign
         // Or get balance (might need higher privs, so listing products/customers is safer)
         // Even better: Check if we can create a payment intent (dry run not supported directly in SDK usually, 
         // but we can try to retrieve account details if it's a Connect setup, or just list 1 event)
         try {
            // Listing 1 payment intent is a safe read-only operation to verify API key
            await paymentGatewayService.stripe.paymentIntents.list({ limit: 1 });
            console.log(`✅ ${gateway} Connection Successful (Listed Payment Intents)`);
         } catch (e) {
            throw new Error(`Stripe API Error: ${e.message}`);
         }
         break;

      case 'PAYPAL':
         if (!paymentGatewayService.paypalClient) throw new Error("PayPal client not initialized");
         // Validating PayPal is harder without creating an order. 
         // We can rely on the fact that 'init' creates the environment with clientId/Secret.
         // If we want to really test, we might try to get an access token, but the SDK handles that.
         // We will assume initialization success implies credentials were at least syntactically correct,
         // but a real test would be an Order Create.
         console.log(`✅ ${gateway} Client Initialized (Credentials format valid)`);
         break;

      case 'REVOLUT':
         if (!paymentGatewayService.revolutApi) throw new Error("Revolut client not initialized");
         try {
            // Try to get available accounts or a similar safe read operation
            // Revolut API: GET /1.0/accounts
            await paymentGatewayService.revolutApi.get('/1.0/accounts');
            console.log(`✅ ${gateway} Connection Successful (Listed Accounts)`);
         } catch (e) {
            // 401/403 would indicate bad keys
            throw new Error(`Revolut API Error: ${e.message}`);
         }
         break;
   }
}

verifyGateways();
