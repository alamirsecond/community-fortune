import axios from 'axios';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const API_BASE = 'http://localhost:4000/api';
const client = axios.create({ baseURL: API_BASE, timeout: 5000 });

const pool = mysql.createPool({
   host: process.env.DB_HOST || '127.0.0.1',
   user: process.env.DB_USER || 'root',
   password: process.env.DB_PASSWORD || '',
   database: process.env.DB_NAME || 'community_fortune',
   waitForConnections: true,
   connectionLimit: 10,
   queueLimit: 0
});

async function runTest() {
   try {
      console.log('--- STARTING SPIN WHEEL E2E TEST ---');

      const [wheels] = await pool.query('SELECT BIN_TO_UUID(id) as id, wheel_name, ticket_price FROM spin_wheels WHERE is_active = 1 AND ticket_price > 0 LIMIT 1');
      if (!wheels.length) throw new Error('No active paid wheel found.');
      const wheel = wheels[0];
      console.log(`Using Paid Wheel: ${wheel.wheel_name} (${wheel.id}) - Price: ${wheel.ticket_price}`);

      const testEmail = `spintest${Date.now()}@example.com`;
      const testPassword = 'Password123!';

      console.log(`Registering new test user: ${testEmail}...`);
      try {
         await client.post(`/users/register`, {
            firstName: 'Spin',
            lastName: 'Tester',
            username: `spintester${Date.now()}`,
            email: testEmail,
            password: testPassword,
            dateOfBirth: '1990-01-01',
            country: 'GB'
         });
         console.log('Register successful.');
      } catch (err) {
         console.log('Register failed:', err.response?.data || err.message);
      }

      console.log('Logging in...');
      let loginRes;
      try {
         loginRes = await client.post(`/users/login`, {
            email: testEmail,
            password: testPassword
         });
      } catch (err) {
         console.error('Login failed:', err.response?.data || err.message);
         throw err;
      }
      const token = loginRes.data.token;
      const userId = loginRes.data.user.id;
      console.log(`Login successful. User ID: ${userId}`);

      const axiosConfig = { headers: { Authorization: `Bearer ${token}` } };

      const [wallets] = await pool.query(`SELECT BIN_TO_UUID(id) as id FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type='CREDIT'`, [userId]);
      if (!wallets.length) {
         await pool.query(`INSERT INTO wallets (id, user_id, type, balance) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'CREDIT', 5000)`, [userId]);
      } else {
         await pool.query(`UPDATE wallets SET balance = 5000 WHERE id = UUID_TO_BIN(?)`, [wallets[0].id]);
      }
      console.log('Loaded user CREDIT wallet with 5000 funds.');

      console.log('\n>>> CYCLE 1: PURCHASE VIA WALLET <<<');
      console.log('Purchasing 1 spin using wallet...');
      let purchaseRes;
      try {
         purchaseRes = await client.post(`/spinWheel/wheels/${wheel.id}/purchase`, {
            quantity: 1,
            use_wallet: true
         }, axiosConfig);
         console.log('Purchase Response:', purchaseRes.data);
      } catch (e) {
         console.error('Purchase Wallet Error:', e.response?.data || e.message);
         throw e;
      }
      const walletPurchaseId = purchaseRes.data.purchase_id;

      console.log('Checking eligibility...');
      let eligRes = await client.get(`/spinWheel/spin/eligibility`, axiosConfig);
      let wheelElig = eligRes.data.wheels.find(w => w.wheel_id === wheel.id);
      console.log('Eligibility Result:', wheelElig);

      console.log('Spinning wheel (Wallet Purchase)...');
      try {
         let spinRes = await axios.post(`${API_BASE}/spinWheel/spin`, {
            wheel_id: wheel.id,
            purchase_id: walletPurchaseId
         }, axiosConfig);
         console.log('Spin Result:', spinRes.data.prize);
      } catch (err) {
         console.error('Spin failed:', err.response?.data || err.message);
      }

      console.log('\n>>> CYCLE 2: PURCHASE VIA EXTERNAL PAYMENT (STRIPE) <<<');

      await pool.query(`UPDATE wallets SET balance = 0 WHERE user_id = UUID_TO_BIN(?)`, [userId]);
      console.log('Zeroed user wallet balance to force external payment.');

      console.log('Initiating external payment for 1 spin...');
      let extPurchaseRes;
      try {
         extPurchaseRes = await client.post(`/spinWheel/wheels/${wheel.id}/purchase`, {
            quantity: 1,
            use_wallet: false,
            payment_method: 'STRIPE'
         }, axiosConfig);
         console.log('Purchase Response (PENDING):', extPurchaseRes.data);
      } catch (e) {
         console.error('External Purchase Error:', e.response?.data || e.message);
         throw e;
      }

      const [purchases] = await pool.query(`
      SELECT BIN_TO_UUID(id) as id FROM purchases 
      WHERE user_id = UUID_TO_BIN(?) AND spin_wheel_id = UUID_TO_BIN(?) AND status = 'PENDING' 
      ORDER BY created_at DESC LIMIT 1
    `, [userId, wheel.id]);

      if (!purchases.length) {
         console.error("Could not find pending purchase in DB.");
      } else {
         const extPurchaseId = purchases[0].id;
         console.log(`Found pending purchase in DB: ${extPurchaseId}`);

         console.log('Checking eligibility (before payment completion)...');
         let eligRes2 = await client.get(`/spinWheel/spin/eligibility`, axiosConfig);
         let wheelElig2 = eligRes2.data.wheels.find(w => w.wheel_id === wheel.id);
         console.log('Eligibility Result Before Paid:', { is_eligible: wheelElig2?.is_eligible, paid_spins_remaining: wheelElig2?.paid_spins_remaining });

         console.log('Simulating Stripe Webhook (Marking purchase as PAID)...');
         await pool.query(`UPDATE purchases SET status = 'PAID' WHERE id = UUID_TO_BIN(?)`, [extPurchaseId]);

         console.log('Checking eligibility (after payment completion)...');
         let eligRes3 = await client.get(`/spinWheel/spin/eligibility`, axiosConfig);
         let wheelElig3 = eligRes3.data.wheels.find(w => w.wheel_id === wheel.id);
         console.log('Eligibility Result After Paid:', { is_eligible: wheelElig3?.is_eligible, paid_spins_remaining: wheelElig3?.paid_spins_remaining });

         console.log('Spinning wheel (External Purchase)...');
         try {
            let spinRes = await axios.post(`${API_BASE}/spinWheel/spin`, {
               wheel_id: wheel.id,
               purchase_id: extPurchaseId
            }, axiosConfig);
            console.log('Spin Result:', spinRes.data.prize);
         } catch (err) {
            console.error('Spin failed:', err.response?.data || err.message);
         }
      }

      console.log('\n--- END OF TEST ---');
   } catch (error) {
      console.error('Unhandled Test Error:', error);
   } finally {
      pool.end();
   }
}

runTest();
