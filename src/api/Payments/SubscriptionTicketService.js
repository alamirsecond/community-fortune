import pool from "../../../database.js";
import paymentGatewayService from './PaymentGatewayService.js';
import secretManager, { SECRET_KEYS } from '../../Utils/secretManager.js';

class SubscriptionTicketService {
  constructor() {
    // Gateways are managed by PaymentGatewayService
  }

  // initPaymentGateways removed - managed by PaymentGatewayService

  // ==================== SUBSCRIPTION METHODS ====================
  async processSubscriptionPayment(userId, tierId, paymentMethodId = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [tier] = await connection.query(
        `SELECT * FROM subscription_tiers WHERE id = UUID_TO_BIN(?) AND is_active = TRUE`,
        [tierId]
      );

      if (!tier.length) throw new Error('Subscription tier not found or inactive');
      const tierData = tier[0];

      const [existing] = await connection.query(
        `SELECT * FROM user_subscriptions 
         WHERE user_id = UUID_TO_BIN(?) AND status = 'ACTIVE'`,
        [userId]
      );

      if (existing.length) throw new Error('User already has an active subscription');

      let paymentMethod = null;
      if (paymentMethodId) {
        const [method] = await connection.query(
          `SELECT * FROM user_payment_methods 
           WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND is_active = TRUE`,
          [paymentMethodId, userId]
        );
        if (method.length) paymentMethod = method[0];
      } else {
        const [defaultMethod] = await connection.query(
          `SELECT * FROM user_payment_methods 
           WHERE user_id = UUID_TO_BIN(?) AND is_default = TRUE AND is_active = TRUE`,
          [userId]
        );
        if (defaultMethod.length) paymentMethod = defaultMethod[0];
      }

      if (!paymentMethod) throw new Error('No payment method available');

      const [paymentRequest] = await connection.query(
        `INSERT INTO payment_requests 
         (id, user_id, type, gateway, amount, currency, status, metadata)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'SUBSCRIPTION', ?, ?, 'GBP', 'PENDING', ?)`,
        [userId, paymentMethod.gateway, tierData.monthly_price, JSON.stringify({ tier_id: tierId })]
      );

      const requestId = paymentRequest.insertId;

      const userEmail = await this.getUserEmail(userId);
      let paymentResult;

      switch (paymentMethod.gateway.toUpperCase()) {
        case 'STRIPE':
          paymentResult = await this.processStripeSubscription(userId, tierData, userEmail, paymentMethod.gateway_account_id);
          break;
        case 'PAYPAL':
          paymentResult = await this.processPayPalSubscription(userId, tierData, userEmail, paymentMethod.gateway_account_id);
          break;
        default:
          throw new Error('Unsupported subscription gateway');
      }

      if (!paymentResult.success) throw new Error(`Payment failed: ${paymentResult.error}`);

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const [subscription] = await connection.query(
        `INSERT INTO user_subscriptions 
         (id, user_id, tier_id, status, start_date, end_date, auto_renew, 
          payment_gateway, gateway_subscription_id)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), UUID_TO_BIN(?), 'ACTIVE', ?, ?, TRUE, ?, ?)`,
        [userId, tierId, startDate, endDate, paymentMethod.gateway, paymentResult.subscriptionId]
      );

      const subscriptionId = subscription.insertId;

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'COMPLETED',
             gateway_payment_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [paymentResult.reference, requestId]
      );

      const [payment] = await connection.query(
        `INSERT INTO payments 
         (id, user_id, type, amount, currency, status, gateway, 
          gateway_reference, reference_id, metadata)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'SUBSCRIPTION', ?, 'GBP', 'COMPLETED', ?, ?, UUID_TO_BIN(?), ?)`,
        [
          userId, tierData.monthly_price, paymentMethod.gateway,
          paymentResult.reference, requestId,
          JSON.stringify({
            tier_id: tierId,
            tier_name: tierData.tier_name,
            subscription_id: subscriptionId,
            billing_cycle: 'monthly'
          })
        ]
      );

      const paymentId = payment.insertId;

      await connection.query(
        `INSERT INTO transactions 
         (id, user_id, type, amount, currency, status, gateway, 
          reference_table, reference_id, payment_id, description)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'subscription', ?, 'GBP', 'completed', ?, 
                 'user_subscriptions', UUID_TO_BIN(?), UUID_TO_BIN(?), ?)`,
        [
          userId, tierData.monthly_price, paymentMethod.gateway,
          subscriptionId, paymentId,
          `Subscription: ${tierData.tier_name}`
        ]
      );

      await this.applySubscriptionBenefits(userId, tierData, subscriptionId);

      await connection.query(
        `UPDATE user_subscriptions SET payment_id = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)`,
        [paymentId, subscriptionId]
      );

      await connection.query(
        `UPDATE payment_requests SET payment_id = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)`,
        [paymentId, requestId]
      );

      await connection.commit();

      return {
        subscriptionId: subscriptionId,
        paymentId: paymentId,
        tierName: tierData.tier_name,
        amount: tierData.monthly_price,
        startDate: startDate,
        endDate: endDate,
        nextBillingDate: endDate
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async processStripeSubscription(userId, tierData, userEmail, paymentMethodId) {
    await paymentGatewayService.validateGatewayAvailability('STRIPE');
    const stripe = paymentGatewayService.getStripe();

    try {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { user_id: userId, tier_id: tierData.id }
      });

      let subscription;

      if (paymentMethodId) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.id
        });

        await stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });

        subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{
            price_data: {
              currency: 'gbp',
              product_data: {
                name: tierData.tier_name,
                description: tierData.description
              },
              unit_amount: Math.round(tierData.monthly_price * 100),
              recurring: { interval: 'month' }
            }
          }],
          payment_settings: {
            payment_method_types: ['card'],
            save_default_payment_method: 'on_subscription'
          },
          expand: ['latest_invoice.payment_intent'],
          metadata: { user_id: userId, tier_id: tierData.id }
        });
      } else {
        subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{
            price_data: {
              currency: 'gbp',
              product_data: {
                name: tierData.tier_name,
                description: tierData.description
              },
              unit_amount: Math.round(tierData.monthly_price * 100),
              recurring: { interval: 'month' }
            }
          }],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            payment_method_types: ['card'],
            save_default_payment_method: 'on_subscription'
          },
          expand: ['latest_invoice.payment_intent'],
          metadata: { user_id: userId, tier_id: tierData.id }
        });
      }

      return {
        success: true,
        subscriptionId: subscription.id,
        paymentId: subscription.latest_invoice?.payment_intent?.id || subscription.id,
        reference: subscription.latest_invoice?.id || subscription.id,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
        subscription: subscription
      };
    } catch (error) {
      console.error('Stripe subscription error:', error);
      return { success: false, error: error.message };
    }
  }

  async processPayPalSubscription(userId, tierData, userEmail) {
    await paymentGatewayService.validateGatewayAvailability('PAYPAL');
    const paypalClient = paymentGatewayService.getPayPal();

    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "GBP",
            value: tierData.monthly_price.toFixed(2)
          },
          description: `Subscription: ${tierData.tier_name}`,
          custom_id: `SUBSCRIPTION_${userId}`
        }],
        application_context: {
          brand_name: "Community Fortune",
          landing_page: "LOGIN",
          user_action: "SUBSCRIBE_NOW",
          shipping_preference: "NO_SHIPPING"
        }
      });

      const order = await paypalClient.execute(request);

      let checkoutUrl = '';
      for (const link of order.result.links) {
        if (link.rel === "approve") {
          checkoutUrl = link.href;
          break;
        }
      }

      return {
        success: true,
        subscriptionId: order.result.id,
        paymentId: order.result.id,
        reference: order.result.id,
        checkoutUrl: checkoutUrl,
        order: order.result
      };
    } catch (error) {
      console.error('PayPal subscription error:', error);
      return { success: false, error: error.message };
    }
  }

  async applySubscriptionBenefits(userId, tierData, subscriptionId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (tierData.monthly_site_credit > 0) {
        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
          [tierData.monthly_site_credit, userId]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'CREDIT',
             ?,
             'Monthly subscription credit'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CREDIT'`,
          [tierData.monthly_site_credit, `SUBSCRIPTION_${subscriptionId}`, userId]
        );
      }

      if (tierData.free_jackpot_tickets > 0) {
        await connection.query(
          `INSERT INTO universal_tickets 
           (id, user_id, ticket_type, source, quantity, expires_at, metadata)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'JACKPOT', 'SUBSCRIPTION', ?, DATE_ADD(NOW(), INTERVAL 30 DAY), ?)`,
          [userId, tierData.free_jackpot_tickets, JSON.stringify({ subscription_id: subscriptionId, tier: tierData.tier_name })]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async cancelSubscription(userId, subscriptionId, reason = '') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [subscription] = await connection.query(
        `SELECT * FROM user_subscriptions 
         WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND status = 'ACTIVE'`,
        [subscriptionId, userId]
      );

      if (!subscription.length) throw new Error('Active subscription not found');
      const sub = subscription[0];

      if (sub.gateway_subscription_id) {
        if (sub.payment_gateway === 'STRIPE') {
          await paymentGatewayService.validateGatewayAvailability('STRIPE');
          const stripe = paymentGatewayService.getStripe();
          await stripe.subscriptions.update(sub.gateway_subscription_id, {
            cancel_at_period_end: true
          });
        }
      }

      await connection.query(
        `UPDATE user_subscriptions 
         SET status = 'CANCELLED', 
             cancelled_at = NOW(),
             cancellation_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [reason, subscriptionId]
      );

      await connection.commit();
      return { success: true, message: 'Subscription cancelled successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== TICKET PURCHASE METHODS ====================
  async purchaseTickets(userId, purchaseData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { competition_id, quantity, payment_method, use_wallet = true, payment_method_id } = purchaseData;

      const [competition] = await connection.query(
        `SELECT * FROM competitions 
         WHERE id = UUID_TO_BIN(?) AND status = 'ACTIVE' AND end_date > NOW()`,
        [competition_id]
      );

      if (!competition.length) throw new Error('Competition not found, inactive, or ended');
      const comp = competition[0];

      const pricePerTicket = comp.price || 1.00;
      const totalAmount = pricePerTicket * quantity;

      if (comp.sold_tickets + quantity > comp.total_tickets) {
        throw new Error(`Not enough tickets available. Only ${comp.total_tickets - comp.sold_tickets} tickets left`);
      }

      let walletUsed = 0;
      let externalPayment = totalAmount;
      let paymentMethodUsed = payment_method;

      if (payment_method_id) {
        const [methods] = await connection.query(
          `SELECT id FROM user_payment_methods
           WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND is_active = TRUE`,
          [payment_method_id, userId]
        );

        if (!methods.length) {
          throw new Error('Payment method not found for user');
        }
      }

      if (use_wallet) {
        const [wallets] = await connection.query(
          `SELECT type, balance FROM wallets 
           WHERE user_id = UUID_TO_BIN(?) AND (type = 'CASH' OR type = 'CREDIT')`,
          [userId]
        );

        let cashBalance = 0;
        let creditBalance = 0;

        wallets.forEach(wallet => {
          if (wallet.type === 'CASH') cashBalance = wallet.balance;
          if (wallet.type === 'CREDIT') creditBalance = wallet.balance;
        });

        if (creditBalance > 0) {
          const creditUse = Math.min(creditBalance, totalAmount);
          walletUsed += creditUse;
          externalPayment -= creditUse;
        }

        if (walletUsed < totalAmount && cashBalance > 0) {
          const cashUse = Math.min(cashBalance, totalAmount - walletUsed);
          walletUsed += cashUse;
          externalPayment -= cashUse;
        }

        if (externalPayment === 0) {
          paymentMethodUsed = 'WALLET';
        } else if (walletUsed > 0) {
          paymentMethodUsed = 'MIXED';
        }
      }

      let paymentResult = null;
      let paymentId = null;

      if (externalPayment > 0) {
        if (!payment_method || payment_method === 'WALLET') {
          throw new Error('External payment method required');
        }

        if (!payment_method_id) {
          throw new Error('Payment method is required');
        }

        const [paymentRequest] = await connection.query(
          `INSERT INTO payment_requests 
           (id, user_id, type, gateway, amount, currency, status, metadata, payment_method_id)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'TICKET', ?, ?, 'GBP', 'PENDING', ?, UUID_TO_BIN(?))`,
          [
            userId,
            payment_method,
            externalPayment,
            JSON.stringify({ competition_id, quantity, ticket_type: 'COMPETITION' }),
            payment_method_id || null
          ]
        );

        const requestId = paymentRequest.insertId;
        const userEmail = await this.getUserEmail(userId);

        paymentResult = await this.processTicketPayment(userId, externalPayment, payment_method, `Tickets for ${comp.title}`, userEmail);

        if (!paymentResult.success) throw new Error(`Payment failed: ${paymentResult.error}`);

        const [payment] = await connection.query(
          `INSERT INTO payments 
           (id, user_id, type, amount, currency, status, gateway, 
            gateway_reference, reference_id, metadata)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'TICKET', ?, 'GBP', 'COMPLETED', ?, ?, UUID_TO_BIN(?), ?)`,
          [
            userId, externalPayment, payment_method,
            paymentResult.reference, requestId,
            JSON.stringify({
              competition_id,
              quantity,
              ticket_type: 'COMPETITION',
              price_per_ticket: pricePerTicket
            })
          ]
        );

        paymentId = payment.insertId;

        await connection.query(
          `UPDATE payment_requests 
           SET status = 'COMPLETED',
               gateway_payment_id = ?,
               payment_id = UUID_TO_BIN(?),
               completed_at = CURRENT_TIMESTAMP
           WHERE id = UUID_TO_BIN(?)`,
          [paymentResult.reference, paymentId, requestId]
        );
      }

      // Generate a UUID for the purchase in JS
      const { v4: uuidv4 } = await import('uuid');
      const purchaseUuid = uuidv4();

      await connection.query(
        `INSERT INTO purchases 
         (id, user_id, competition_id, ticket_type, quantity, total_amount,
          site_credit_used, cash_wallet_used, external_payment, payment_method,
          gateway_reference, payment_id, status)
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'COMPETITION', ?, ?, 
                 ?, ?, ?, ?, ?, UUID_TO_BIN(?), 'PAID')`,
        [
          purchaseUuid, userId, competition_id, quantity, totalAmount,
          walletUsed, 0,
          externalPayment, paymentMethodUsed,
          paymentResult?.reference || null,
          paymentId
        ]
      );

      const purchaseId = purchaseUuid;

      const tickets = [];
      const ticketNumbers = [];

      for (let i = 0; i < quantity; i++) {
        const ticketNumber = comp.sold_tickets + i + 1;
        ticketNumbers.push(ticketNumber);

        const [ticket] = await connection.query(
          `INSERT INTO tickets 
           (id, competition_id, user_id, purchase_id, ticket_number, ticket_type, 
            status, price_paid, generated_at)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 
                   'ACTIVE', ?, NOW())`,
          [competition_id, userId, purchaseId, ticketNumber, 'COMPETITION', pricePerTicket]
        );

        tickets.push({
          id: ticket.insertId,
          ticket_number: ticketNumber,
          competition_id,
          purchase_id: purchaseId
        });
      }

      await connection.query(
        `UPDATE competitions SET sold_tickets = sold_tickets + ? WHERE id = UUID_TO_BIN(?)`,
        [quantity, competition_id]
      );

      if (walletUsed > 0) {
        await this.deductFromWallet(userId, walletUsed, purchaseId, `Ticket purchase for ${comp.title}`);
      }

      await connection.query(
        `INSERT INTO transactions 
         (id, user_id, type, amount, currency, status, gateway, 
          reference_table, reference_id, payment_id, description)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'purchase', ?, 'GBP', 'completed', ?, 
                 'purchases', UUID_TO_BIN(?), UUID_TO_BIN(?), ?)`,
        [
          userId, totalAmount, paymentMethodUsed,
          purchaseId, paymentId || null,
          `${quantity} ticket(s) for ${comp.title}`
        ]
      );

      await connection.query(
        `INSERT INTO competition_entries 
         (id, competition_id, user_id, entry_type, purchase_id, status, entry_date)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PAID_TICKET', UUID_TO_BIN(?), 'ACTIVE', NOW())`,
        [competition_id, userId, purchaseId]
      );

      if (comp.sold_tickets + quantity >= comp.total_tickets) {
        await this.scheduleCompetitionDraw(competition_id);
      }

      await connection.commit();

      return {
        purchaseId: purchaseId,
        tickets: tickets,
        ticketNumbers: ticketNumbers,
        totalAmount: totalAmount,
        walletUsed: walletUsed,
        externalPayment: externalPayment,
        paymentMethod: paymentMethodUsed,
        competitionTitle: comp.title,
        pricePerTicket: pricePerTicket
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async processTicketPayment(userId, amount, gateway, description, userEmail) {
    try {
      switch (gateway.toUpperCase()) {
        case 'STRIPE':
          return await this.processStripeTicketPayment(amount, description, userEmail);
        case 'PAYPAL':
          return await this.processPayPalTicketPayment(amount, description, userEmail);
        case 'REVOLUT':
          return await this.processRevolutTicketPayment(amount, description);
        default:
          return { success: false, error: 'Unsupported payment gateway' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processStripeTicketPayment(amount, description, userEmail) {
    try {
      await paymentGatewayService.validateGatewayAvailability('STRIPE');
      const stripe = paymentGatewayService.getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        description: description,
        receipt_email: userEmail
      });

      return {
        success: true,
        reference: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        paymentIntent: paymentIntent
      };
    } catch (error) {
      console.error('Stripe ticket payment error:', error);
      return { success: false, error: error.message };
    }
  }

  async processPayPalTicketPayment(amount, description, userEmail) {
    try {
      await paymentGatewayService.validateGatewayAvailability('PAYPAL');
      const paypalClient = paymentGatewayService.getPayPal();
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "GBP",
            value: amount.toFixed(2)
          },
          description: description,
          custom_id: `TICKET_${Date.now()}`
        }],
        application_context: {
          brand_name: "Community Fortune",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING"
        }
      });

      const order = await paypalClient.execute(request);

      let checkoutUrl = '';
      for (const link of order.result.links) {
        if (link.rel === "approve") {
          checkoutUrl = link.href;
          break;
        }
      }

      return {
        success: true,
        reference: order.result.id,
        checkoutUrl: checkoutUrl,
        order: order.result
      };
    } catch (error) {
      console.error('PayPal ticket payment error:', error);
      return { success: false, error: error.message };
    }
  }

  async processRevolutTicketPayment(amount, description) {
    try {
      await paymentGatewayService.validateGatewayAvailability('REVOLUT');
      const revolutApi = paymentGatewayService.getRevolut();
      const order = await revolutApi.post('/orders', {
        amount: Math.round(amount * 100),
        currency: 'GBP',
        description,
        metadata: {
          type: 'ticket'
        }
      });

      return {
        success: true,
        reference: order.data.id,
        checkoutUrl: order.data.checkout_url,
        order: order.data
      };
    } catch (error) {
      console.error('Revolut ticket payment error:', error);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  async deductFromWallet(userId, amount, referenceId, description) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE wallets 
         SET balance = balance - ? 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH' AND balance >= ?`,
        [amount, userId, amount]
      );

      const [wallet] = await connection.query(
        `SELECT id FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [userId]
      );

      if (wallet.length) {
        // wallet[0].id is already stored as binary(16); pass it directly
        // instead of wrapping in UUID_TO_BIN() which expects a string.
        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, 'DEBIT', ?, ?)`,
          [wallet[0].id, amount, `PURCHASE_${referenceId}`, description]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async scheduleCompetitionDraw(competitionId) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        `UPDATE competitions 
         SET status = 'COMPLETED',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [competitionId]
      );
    } finally {
      connection.release();
    }
  }

  // ==================== UNIVERSAL TICKET PURCHASES ====================
  async purchaseUniversalTickets(userId, purchaseData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { ticket_type, quantity, payment_method, use_wallet = true, payment_method_id } = purchaseData;

      const ticketConfig = {
        JACKPOT: { price: 2.00 },
        SCRATCH_CARD: { price: 1.00 },
        RAFFLE: { price: 0.50 },
        LOTTERY: { price: 5.00 }
      };

      const config = ticketConfig[ticket_type.toUpperCase()] || { price: 1.00 };
      const pricePerTicket = config.price;
      const totalAmount = pricePerTicket * quantity;

      let walletUsed = 0;
      let externalPayment = totalAmount;
      let paymentMethodUsed = payment_method;

      if (payment_method_id) {
        const [methods] = await connection.query(
          `SELECT id FROM user_payment_methods
           WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND is_active = TRUE`,
          [payment_method_id, userId]
        );

        if (!methods.length) {
          throw new Error('Payment method not found for user');
        }
      }

      if (use_wallet) {
        const [wallets] = await connection.query(
          `SELECT type, balance FROM wallets 
           WHERE user_id = UUID_TO_BIN(?) AND (type = 'CASH' OR type = 'CREDIT')`,
          [userId]
        );

        let cashBalance = 0;
        let creditBalance = 0;

        wallets.forEach(wallet => {
          if (wallet.type === 'CASH') cashBalance = wallet.balance;
          if (wallet.type === 'CREDIT') creditBalance = wallet.balance;
        });

        if (creditBalance > 0) {
          const creditUse = Math.min(creditBalance, totalAmount);
          walletUsed += creditUse;
          externalPayment -= creditUse;
        }

        if (walletUsed < totalAmount && cashBalance > 0) {
          const cashUse = Math.min(cashBalance, totalAmount - walletUsed);
          walletUsed += cashUse;
          externalPayment -= cashUse;
        }

        if (externalPayment === 0) {
          paymentMethodUsed = 'WALLET';
        } else if (walletUsed > 0) {
          paymentMethodUsed = 'MIXED';
        }
      }

      let paymentResult = null;
      let paymentId = null;

      if (externalPayment > 0) {
        if (!payment_method || payment_method === 'WALLET') {
          throw new Error('External payment method required');
        }

        if (!payment_method_id) {
          throw new Error('Payment method is required');
        }

        const userEmail = await this.getUserEmail(userId);
        paymentResult = await this.processTicketPayment(userId, externalPayment, payment_method, `${quantity} ${ticket_type} ticket(s)`, userEmail);

        if (!paymentResult.success) throw new Error(`Payment failed: ${paymentResult.error}`);

        const [payment] = await connection.query(
          `INSERT INTO payments 
           (id, user_id, type, amount, currency, status, gateway, 
            gateway_reference, metadata)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'TICKET', ?, 'GBP', 'COMPLETED', ?, ?, ?)`,
          [
            userId, externalPayment, payment_method,
            paymentResult.reference,
            JSON.stringify({
              ticket_type,
              quantity,
              price_per_ticket: pricePerTicket,
              type: 'UNIVERSAL'
            })
          ]
        );

        paymentId = payment.insertId;
      }

      const [purchase] = await connection.query(
        `INSERT INTO purchases 
         (id, user_id, ticket_type, quantity, total_amount,
          site_credit_used, cash_wallet_used, external_payment, payment_method,
          gateway_reference, payment_id, status, is_universal)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?, 
                 ?, ?, ?, ?, ?, UUID_TO_BIN(?), 'COMPLETED', TRUE)`,
        [
          userId, ticket_type, quantity, totalAmount,
          walletUsed, 0,
          externalPayment, paymentMethodUsed,
          paymentResult?.reference || null,
          paymentId
        ]
      );

      const purchaseId = purchase.insertId;

      await connection.query(
        `INSERT INTO universal_tickets 
         (id, user_id, ticket_type, source, quantity, purchased_at, expires_at, metadata)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, 'PURCHASE', ?, NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), ?)`,
        [userId, ticket_type, quantity, JSON.stringify({ purchase_id: purchaseId, price_per_ticket: pricePerTicket })]
      );

      if (walletUsed > 0) {
        await this.deductFromWallet(userId, walletUsed, purchaseId, `${quantity} ${ticket_type} ticket purchase`);
      }

      if (paymentId) {
        await connection.query(
          `INSERT INTO transactions 
           (id, user_id, type, amount, currency, status, gateway, 
            reference_table, reference_id, payment_id, description)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'purchase', ?, 'GBP', 'completed', ?, 
                   'purchases', UUID_TO_BIN(?), UUID_TO_BIN(?), ?)`,
          [
            userId, totalAmount, paymentMethodUsed,
            purchaseId, paymentId,
            `${quantity} ${ticket_type} ticket(s)`
          ]
        );
      }

      await connection.commit();

      return {
        purchaseId: purchaseId,
        ticketType: ticket_type,
        quantity: quantity,
        totalAmount: totalAmount,
        walletUsed: walletUsed,
        externalPayment: externalPayment,
        paymentMethod: paymentMethodUsed,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== HELPER METHODS ====================
  async getUserEmail(userId) {
    const [user] = await pool.query(
      `SELECT email FROM users WHERE id = UUID_TO_BIN(?)`,
      [userId]
    );
    return user.length ? user[0].email : null;
  }

  async getUserSubscriptions(userId) {
    const [subscriptions] = await pool.query(
      `SELECT 
        BIN_TO_UUID(us.id) as id,
        BIN_TO_UUID(us.tier_id) as tier_id,
        st.tier_name,
        st.description,
        st.monthly_price,
        us.status,
        us.start_date,
        us.end_date,
        us.auto_renew,
        us.payment_gateway,
        us.gateway_subscription_id,
        us.created_at,
        us.updated_at
       FROM user_subscriptions us
       JOIN subscription_tiers st ON us.tier_id = st.id
       WHERE us.user_id = UUID_TO_BIN(?)
       ORDER BY us.created_at DESC`,
      [userId]
    );

    return subscriptions;
  }

  async getUserTickets(userId, filters = {}) {
    let query = `
      SELECT 
        BIN_TO_UUID(t.id) as id,
        BIN_TO_UUID(t.competition_id) as competition_id,
        c.title as competition_title,
        c.prize_value,
        c.end_date,
        t.ticket_number,
        t.ticket_type,
        t.status,
        t.price_paid,
        t.generated_at,
        BIN_TO_UUID(t.purchase_id) as purchase_id
      FROM tickets t
      LEFT JOIN competitions c ON t.competition_id = c.id
      WHERE t.user_id = UUID_TO_BIN(?)
    `;

    const params = [userId];

    if (filters.competition_id) {
      query += ` AND t.competition_id = UUID_TO_BIN(?)`;
      params.push(filters.competition_id);
    }

    if (filters.status) {
      query += ` AND t.status = ?`;
      params.push(filters.status);
    }

    if (filters.active_only) {
      query += ` AND t.status = 'ACTIVE' AND c.end_date > NOW()`;
    }

    query += ` ORDER BY t.generated_at DESC`;

    const [tickets] = await pool.query(query, params);

    const [universalTickets] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        ticket_type,
        quantity,
        source,
        purchased_at,
        expires_at,
        metadata
       FROM universal_tickets 
       WHERE user_id = UUID_TO_BIN(?) 
       AND expires_at > NOW()
       ORDER BY purchased_at DESC`,
      [userId]
    );

    return {
      competitionTickets: tickets,
      universalTickets: universalTickets
    };
  }

  async getSubscriptionTiers() {
    const [tiers] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        tier_name,
        tier_code,
        description,
        monthly_price,
        yearly_price,
        is_active,
        monthly_site_credit,
        free_jackpot_tickets,
        daily_free_tickets,
        increased_win_chance,
        exclusive_badge,
        benefits,
        features,
        display_order,
        created_at
       FROM subscription_tiers 
       WHERE is_active = TRUE
       ORDER BY display_order, monthly_price`
    );

    return tiers.map(tier => ({
      ...tier,
      benefits: tier.benefits ? JSON.parse(tier.benefits) : [],
      features: tier.features ? JSON.parse(tier.features) : []
    }));
  }

}

export default new SubscriptionTicketService();