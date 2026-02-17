# Stripe Frontend Submission Guide

This guide explains how the frontend should create a Stripe PaymentMethod (pm_...) and submit it to the backend for deposits, plus how to confirm the deposit PaymentIntent.

## Prerequisites

- Stripe publishable key is configured in the frontend (pk_test_... or pk_live_...).
- Stripe secret key is configured on the backend via `/api/settings/secrets`.
- Stripe gateway is enabled in the backend (SANDBOX for dev, LIVE for prod).
- The user is authenticated and has a valid JWT for API calls.

## 1) Create a Stripe PaymentMethod (client-side)

Use Stripe.js to create a `pm_...` from the user card input.

### Option A: Stripe Elements (recommended)

```html
<script src="https://js.stripe.com/v3/"></script>
<div id="card-element"></div>
<button id="save-card">Save Card</button>

<script>
  const stripe = Stripe("pk_test_...");
  const elements = stripe.elements();
  const card = elements.create("card");
  card.mount("#card-element");

  document.getElementById("save-card").addEventListener("click", async () => {
    const { paymentMethod, error } = await stripe.createPaymentMethod({
      type: "card",
      card
    });

    if (error) {
      console.error(error.message);
      return;
    }

    // paymentMethod.id is the pm_...
    console.log("PM ID", paymentMethod.id);
  });
</script>
```

### Option B: Payment Element

If using Payment Element, you still call `stripe.createPaymentMethod` after the element is completed, or confirm via PaymentIntent (see below) and store the payment method id from the response.

## 2) Save the PaymentMethod in the backend

Call the backend endpoint to store the payment method so it can be used in deposits.

Endpoint:
```
POST /api/payments/methods
```

Body example:
```json
{
  "gateway": "STRIPE",
  "method_type": "CARD",
  "gateway_account_id": "pm_1234567890",
  "display_name": "Visa",
  "last_four": "4242",
  "expiry_month": 12,
  "expiry_year": 2030,
  "card_brand": "visa",
  "is_default": true
}
```

Notes:
- `gateway_account_id` MUST be the Stripe `pm_...` id.
- `payment_method_id` returned by the API is a UUID used for deposits.

## 3) Create a deposit (server returns clientSecret)

Endpoint:
```
POST /api/payments/deposits
```

Body example:
```json
{
  "amount": 10,
  "gateway": "STRIPE",
  "wallet_type": "CASH",
  "currency": "GBP",
  "payment_method_id": "<UUID_FROM_METHODS>"
}
```

Response includes:
- `clientSecret` (Stripe PaymentIntent client secret)

## 4) Confirm the PaymentIntent (client-side)

After creating the deposit, confirm it on the client:

```js
const result = await stripe.confirmCardPayment(clientSecret);
if (result.error) {
  console.error(result.error.message);
} else {
  console.log("PaymentIntent status", result.paymentIntent.status);
}
```

Stripe webhooks will update the backend status automatically when:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

## 5) Common errors

- "No such PaymentMethod":
  - You are sending a local UUID instead of a Stripe `pm_...` id.
- "StripeConnectionError":
  - Backend server cannot reach `api.stripe.com` (DNS/firewall issue).
- "jwt expired":
  - User token is expired; login again and retry.

## Production notes

- Never send raw card details to your backend.
- Always use Stripe.js or Stripe Elements on the client.
- Rotate keys if they are exposed in logs or chats.
