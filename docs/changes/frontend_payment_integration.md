# Frontend Developer Guide: Deposits & Withdrawals

This document explains the complete flow for handling user deposits and withdrawals using our consolidated payment system (Stripe, PayPal, Bank Transfers).

---

## 1. Withdrawals Flow

Withdrawals are initiated by the user, reviewed by an admin, and then processed to the user's preferred payment method.

### Step 1: Requesting a Withdrawal (User)
The user submits a request to withdraw funds from their `CASH` wallet.

**Endpoint:** `POST /api/withdrawals/request`
**Auth Required:** User Token

**Payload Example (Stripe):**
```json
{
  "amount": 100,
  "paymentMethod": "STRIPE",
  "accountDetails": {
    "stripeAccountId": "acct_123456789" // user's connected Stripe account ID
  }
}
```

**Sample successful response:**
```json
{
  "success": true,
  "data": {
    "withdrawalId": "9f1a2d4b-...",      // id for this withdrawal record
    "status": "PENDING",
    "paymentMethod": "STRIPE",          // gateway chosen
    "requestedAt": "2025-10-01T12:34:56Z"
  }
}
```

The frontend should store `withdrawalId` locally so it can poll or display
status changes (`PENDING_VERIFICATION`, `PROCESSING`, etc.). It can also
later be used by admin routes or webhooks to update the record further, and
is the `target_id` that appears in activity logs.

**What happens on the backend:**
1. Verifies the user's KYC status and age.
2. Checks if the user has sufficient funds in their `CASH` wallet.
3. Enforces daily/monthly spending and withdrawal limits.
4. Deducts the funds from the `CASH` wallet and creates a `HOLD` transaction in the ledger.
5. Returns a `201 Created` with a `withdrawalId` and a `PENDING` status.

### Step 2: Withdrawal Verification (Optional OTP)
If the system flags the withdrawal for OTP verification, the status will be `PENDING_VERIFICATION`. The frontend must prompt the user for an OTP sent to their email.

**Endpoint:** `POST /api/withdrawals/verify-otp`
**Auth Required:** User Token

**Payload:**
```json
{
  "withdrawalId": "uuid...",
  "otp": "123456"
}
```
*Upon success, the status changes to `PROCESSING`.*

**Response example:**
```json
{
  "success": true,
  "withdrawalId": "9f1a2d4b-...",
  "status": "PROCESSING",
  "verifiedAt": "2025-10-01T12:40:00Z"
}
```

The frontend can now show a message such as "OTP verified – funds will be
transferred shortly." Continue polling the withdrawal record by id if you wish.

### Step 3: Admin Approval (Admin Panel)
Before the money actually leaves the platform, an admin must approve the request.

**Endpoint:** `PUT /api/withdrawals/:withdrawalId/status`
**Auth Required:** Admin Token

**Payload:**
```json
{
  "status": "APPROVED",
  "reason": "Passed checks",
  "adminNotes": "Ready for payout"
}
```

### Step 4: Live Processing (Admin Panel)
Once approved, the admin triggers the actual payout to the user's Stripe account or Bank.

**Endpoint:** `POST /api/payments/withdrawals/:withdrawalId/process`
**Auth Required:** Admin Token
**Payload:** `{}`

**What happens on the backend:**
1. The system reads the `accountDetails` from Step 1.
2. It executes a live `stripe.payouts.create` or `stripe.transfers.create` call.
3. The withdrawal is marked as `PROCESSING` or `COMPLETED` based on the gateway response.

---

## 2. Deposits Flow

Deposits require direct user interaction with a payment gateway (like a Stripe Checkout form) to capture their credit card details. This requires a 3-step handshake between the Frontend, Backend, and Stripe.

### Step 1: Create a Deposit Intent (Frontend)
When the user wants to add funds, the frontend first asks the backend to create an "intent" to pay.

**Endpoint:** `POST /api/payments/deposits`
**Auth Required:** User Token

**Payload:**
```json
{
  "amount": 50,
  "gateway": "STRIPE",
  "wallet_type": "CASH",
  "currency": "GBP"
}
```

**Expected Response:**
```json
{
    "success": true,
    "data": {
        "paymentId": "uuid-1234",      // internal payments table id
        "requestId": "uuid-5678",      // payment_requests table id
        "clientSecret": "pi_3Qxxxxxxxxxxx_secret_yyyyyyyyyyyy"
    }
}
```
*The `clientSecret` is what you pass to Stripe.js to render the card form.*

> `paymentId` and `requestId` are useful for debugging, linking to the
> deposit status endpoints, or sending them to the backend when you later
> query `GET /api/payments/deposits/:paymentId`.

### Step 2: Confirm the Payment (Frontend + Stripe.js)
The frontend must securely collect the user's credit card details. **Never send credit card numbers directly to our backend.**

Using Stripe.js or React Stripe Elements on the frontend, you initialize the payment form using the `clientSecret` obtained in Step 1.

```javascript
// Example Stripe.js integration
const stripe = await loadStripe('pk_test_YOUR_STRIPE_PUBLIC_KEY');

// When the user clicks "Pay $50"
const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: elements.getElement(CardElement),
    billing_details: {
      name: 'John Doe',
    },
  }
});

if (error) {
  // Show error to your customer
  console.log(error.message);
} else {
  // The payment has been processed!
  if (paymentIntent.status === 'succeeded') {
    // Show a success message to your customer
  }
}
```

### Step 3: Webhook Fulfillment (Automated Backend)
Even though the frontend knows the payment succeeded in Step 2, **the frontend does not update the user's balance**. This prevents malicious users from easily hacking their balance.

Instead, Stripe's servers will instantly send a secure webhook (`POST /api/payments/webhook/stripe`) to our backend. 

**What happens on the backend:**
1. Verifies the cryptographic signature of the webhook to ensure it actually came from Stripe.
2. Finds the corresponding `paymentId` in the database.
3. Updates the payment status from `PENDING` to `COMPLETED`.
4. Automatically credits the $50 to the user's `CASH` wallet.

**Frontend Polling:** To show the updated balance to the user immediately, the frontend should either listen for WebSockets or poll `GET /api/payments/deposits` until the specific deposit status changes to `COMPLETED`.
