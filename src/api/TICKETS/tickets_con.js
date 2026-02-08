import pool from "../../../database.js";
import { v4 as uuidv4 } from "uuid";
import ticketSchemas from "./tickets_zod.js";
import SpendingLimitsService from "../spendingLimits/spending_limit_con.js";
import processInstantWin from "../INSTANT WINS/instantWins_con.js";
import SubscriptionTicketService from "../Payments/SubscriptionTicketService.js";

class TicketSystemController {
  static async createPayPalTicketPayment(req, res) {
  const connection = await pool.getConnection();
  
  try {
    const { competition_id, quantity, save_payment_method } = req.body;
    const user_id = req.user.id;

    // Get competition details
    const [competition] = await connection.query(
      `
      SELECT price, title, total_tickets, sold_tickets 
      FROM competitions 
      WHERE id = UUID_TO_BIN(?)
      `,
      [competition_id]
    );

    if (!competition.length) {
      throw new Error("Competition not found");
    }

    const comp = competition[0];
    const totalAmount = comp.price * quantity;

    // Check if competition has enough tickets
    if (comp.total_tickets && (comp.sold_tickets + quantity > comp.total_tickets)) {
      throw new Error("Competition is sold out");
    }

    // Create PayPal payment request
    const paypalReq = {
      amount: totalAmount,
      description: `Purchase of ${quantity} ticket(s) for ${comp.title}`,
      type: 'TICKET',
      reference_id: competition_id,
      metadata: {
        quantity: quantity,
        competition_title: comp.title,
        ticket_price: comp.price
      },
      save_payment_method: save_payment_method || false
    };

    // Forward to PayPal controller (you would call the PayPal API directly)
    // For now, return the payment details
    res.json({
      requires_payment: true,
      payment_method: 'PAYPAL',
      amount: totalAmount,
      currency: 'GBP',
      competition: {
        id: competition_id,
        title: comp.title,
        price: comp.price,
        quantity: quantity
      },
      message: "Please proceed with PayPal payment"
    });

  } catch (error) {
    console.error("Create PayPal ticket payment error:", error);
    res.status(400).json({
      error: error.message,
      code: "PAYPAL_TICKET_ERROR"
    });
  } finally {
    connection.release();
  }
}

// controllers/ticketSystem/tickets_con.js - DEBUG VERSION
static async allocateTickets(req, res) {
  const connection = await pool.getConnection();
  console.log('1. Got database connection');

  try {
    console.log('2. Starting transaction');
    await connection.beginTransaction();

    // Validate request
    console.log('3. Validating request body:', req.body);
    const validationResult = ticketSchemas.allocateTickets.safeParse(req.body);
    if (!validationResult.success) {
      console.log('3a. Validation failed:', validationResult.error.errors);
      return res.status(400).json({
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    const {
      competition_id,
      quantity,
      use_universal_tickets = false,
      payment_method = 'CREDIT_WALLET',
      payment_id = null,
      voucher_code = null
    } = validationResult.data;
    
    const user_id = req.user.id;
    console.log('4. User ID:', user_id, 'Competition ID:', competition_id);

    // FIRST, try without FOR UPDATE to see if the query works
    console.log('5. Querying competition WITHOUT FOR UPDATE...');
    const [competitionSimple] = await connection.query(
     `
        SELECT 
          BIN_TO_UUID(c.id) AS id,
          c.title,
          c.price,
          c.total_tickets,
          c.sold_tickets,
          c.category,
          c.type,
          c.start_date,
          c.end_date,
          c.status,
          c.max_entries_per_user,
          c.is_free_competition,
          COUNT(t.id) AS user_tickets_count
        FROM competitions c
        LEFT JOIN tickets t 
          ON c.id = t.competition_id
          AND t.user_id = UUID_TO_BIN(?)
        WHERE c.id = UUID_TO_BIN(?)
          AND c.status = 'ACTIVE'
        FOR UPDATE
        `,
      [user_id, competition_id]
    );

    console.log('5a. Competition query result:', competitionSimple);

    if (!competitionSimple || competitionSimple.length === 0) {
      throw new Error("Competition not found or inactive");
    }

    // Now try with the user tickets count (but still without FOR UPDATE)
    console.log('6. Getting user tickets count...');
    const [userTicketsCount] = await connection.query(
      `
      SELECT COUNT(*) as user_tickets_count
      FROM tickets t
      WHERE t.competition_id = UUID_TO_BIN(?)
        AND t.user_id = UUID_TO_BIN(?)
      `,
      [competition_id, user_id]
    );

    console.log('6a. User tickets count:', userTicketsCount[0]);

    const comp = {
      ...competitionSimple[0],
      user_tickets_count: userTicketsCount[0].user_tickets_count
    };

    console.log('7. Competition data:', comp);

    // Check if competition is free
    if (comp.is_free_competition && comp.price === 0) {
      console.log('8. Handling free competition...');
      return await this.handleFreeCompetitionEntry(connection, req, res, comp, user_id, quantity);
    }

    // Check max entries per user
    if (comp.max_entries_per_user && comp.user_tickets_count + quantity > comp.max_entries_per_user) {
      throw new Error(
        `Maximum ${comp.max_entries_per_user} tickets allowed per user`
      );
    }

    console.log('9. Max entries check passed');

    // Check if competition has enough tickets
    if (comp.total_tickets && (comp.sold_tickets + quantity > comp.total_tickets)) {
      throw new Error("Competition is sold out");
    }

    

    console.log('10. Ticket availability check passed');

    // Calculate amount
    const finalAmount = comp.price * quantity;
    console.log('11. Final amount:', finalAmount, 'Price:', comp.price, 'Quantity:', quantity);

      // Apply voucher if provided
      let voucherDiscount = 0;
      let voucherId = null;
      
      if (voucher_code) {
        const voucherResult = await this.applyVoucher(connection, user_id, voucher_code, comp, quantity);
        voucherDiscount = voucherResult.discount;
        voucherId = voucherResult.voucherId;
        finalAmount = voucherResult.finalAmount;
      }

        if (use_universal_tickets) {
        // Use universal tickets
        return await this.handleUniversalTickets(connection, req, res, {
          competition: comp,
          user_id,
          quantity,
          competition_id
        });
      }
    // Handle PayPal payment
    else if  (payment_method === 'PAYPAL') {
      console.log('12. Handling PayPal payment...');
      if (!payment_id) {
        console.log('12a. No payment_id, creating PayPal payment request');
        await connection.rollback(); // Rollback since we're not committing
        
        // Create payment record
        const paymentId = uuidv4();
        console.log('12b. Creating payment record with ID:', paymentId);
        
        await connection.query(
          `
          INSERT INTO payments (
            id, user_id, type, reference_id, amount, currency,
            status, gateway, metadata
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), ?, ?, 
            'PENDING', 'PAYPAL', ?)
          `,
          [
            paymentId, 
            user_id, 
            'TICKET', 
            competition_id, 
            finalAmount, 
            'GBP',
            JSON.stringify({
              quantity: quantity,
              competition_title: comp.title,
              ticket_price: comp.price
            })
          ]
        );

        console.log('12c. Payment record created');

        // Create purchase record
        const purchaseId = uuidv4();
        console.log('12d. Creating purchase record with ID:', purchaseId);
        
        await connection.query(
          `
          INSERT INTO purchases (
            id, user_id, competition_id, status, payment_method,
            total_amount, payment_id
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PENDING',
            'PAYPAL', ?, UUID_TO_BIN(?))
          `,
          [purchaseId, user_id, competition_id, finalAmount, paymentId]
        );

        console.log('12e. Purchase record created');

        // Return response
        return res.json({
          requires_payment: true,
          payment_method: 'PAYPAL',
          payment_id: paymentId,
          purchase_id: purchaseId,
          amount: finalAmount,
          currency: 'GBP',
          competition: {
            id: comp.id,
            title: comp.title,
            price: comp.price,
            quantity: quantity
          },
          message: "Please proceed with PayPal payment"
        });
      }
    }

    // If we get here, something went wrong
    console.log('13. Unexpected flow reached');
    await connection.rollback();
    return res.status(500).json({
      error: "Unexpected error occurred",
      code: "UNEXPECTED_FLOW"
    });

  } catch (error) {
    console.error("DEBUG - Allocate tickets error:", error);
    console.error("Error stack:", error.stack);
    
    try {
      await connection.rollback();
      console.log('Rollback successful');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }
    
    res.status(400).json({
      error: error.message,
      code: error.code || "TICKET_ALLOCATION_ERROR",
    });
  } finally {
    console.log('Finally - releasing connection');
    connection.release();
    console.log('Connection released');
  }
}

  static async purchaseTickets(req, res) {
    const validationResult = ticketSchemas.purchaseTickets.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
    }

    try {
      const user_id = req.user.id;
      const result = await SubscriptionTicketService.purchaseTickets(
        user_id,
        validationResult.data
      );

      return res.status(200).json({
        success: true,
        message: "Tickets purchased successfully",
        data: result,
      });
    } catch (error) {
      console.error("Purchase tickets error:", error);
      const statusCode =
        error.message && error.message.toLowerCase().includes("not found")
          ? 404
          : 400;

      return res.status(statusCode).json({
        error: error.message,
        code: "TICKET_PURCHASE_ERROR",
      });
    }
  }
  // Handle free competition entry
  static async handleFreeCompetitionEntry(connection, req, res, competition, user_id, quantity) {
    try {
      // Allocate tickets for free competition
      const allocatedTickets = await this.allocateCompetitionTickets(
        connection,
        user_id,
        competition.id,
        quantity,
        null, // No purchase_id for free entries
        true  // is_free_entry
      );

      // Update competition sold tickets
      await connection.query(
        `
        UPDATE competitions 
        SET sold_tickets = sold_tickets + ? 
        WHERE id = UUID_TO_BIN(?)
        `,
        [quantity, competition.id]
      );

      await connection.commit();

      res.json({
        success: true,
        tickets: allocatedTickets,
        competition: {
          id: competition.id,
          title: competition.title,
          total_tickets: competition.total_tickets,
          sold_tickets: competition.sold_tickets + quantity,
          tickets_remaining: competition.total_tickets - (competition.sold_tickets + quantity),
          ticket_price: competition.price,
        },
        free_entry: true
      });

    } catch (error) {
      throw error;
    }
  }

  // Handle universal tickets
  static async handleUniversalTickets(connection, req, res, params) {
    try {
      const { competition, user_id, quantity, competition_id } = params;

      // Check if user has enough universal tickets
      const [universalTickets] = await connection.query(
        `
        SELECT COUNT(*) as available 
        FROM universal_tickets 
        WHERE user_id = UUID_TO_BIN(?) 
        AND is_used = FALSE 
        AND (expires_at IS NULL OR expires_at > NOW())
        `,
        [user_id]
      );

      if (universalTickets[0].available < quantity) {
        throw new Error(
          `Insufficient universal tickets. Available: ${universalTickets[0].available}, Required: ${quantity}`
        );
      }

      // Use universal tickets
      const allocatedTickets = await this.useUniversalTickets(
        connection,
        user_id,
        competition_id,
        quantity
      );

      // Update competition sold tickets
      await connection.query(
        `
        UPDATE competitions 
        SET sold_tickets = sold_tickets + ? 
        WHERE id = UUID_TO_BIN(?)
        `,
        [quantity, competition_id]
      );

      await connection.commit();

      res.json({
        success: true,
        tickets: allocatedTickets,
        competition: {
          id: competition.id,
          title: competition.title,
          total_tickets: competition.total_tickets,
          sold_tickets: competition.sold_tickets + quantity,
          tickets_remaining: competition.total_tickets - (competition.sold_tickets + quantity),
          ticket_price: competition.price,
        },
        payment_method: 'UNIVERSAL_TICKETS'
      });

    } catch (error) {
      throw error;
    }
  }

  // Handle PayPal payment
  static async handlePayPalPayment(connection, req, res, params) {
    try {
      const { 
        competition, 
        user_id, 
        quantity, 
        competition_id, 
        finalAmount,
        payment_id,
        voucherId,
        voucherDiscount
      } = params;

      if (!payment_id) {
        // No payment_id provided, return PayPal payment creation response
        await connection.rollback(); // Rollback since we're not committing
        
        // Create payment record first
        const paymentId = uuidv4();
        await connection.query(
          `
          INSERT INTO payments (
            id, user_id, type, reference_id, amount, currency,
            status, gateway, metadata
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), ?, ?, 
            'PENDING', 'PAYPAL', ?)
          `,
          [
            paymentId, 
            user_id, 
            'TICKET', 
            competition_id, 
            finalAmount, 
            'GBP',
            JSON.stringify({
              quantity: quantity,
              competition_title: competition.title,
              ticket_price: competition.price,
              voucher_id: voucherId ? voucherId : null,
              voucher_discount: voucherDiscount,
              original_amount: competition.price * quantity
            })
          ]
        );

        // Create purchase record
        const purchaseId = uuidv4();
        await connection.query(
          `
          INSERT INTO purchases (
            id, user_id, competition_id, status, payment_method,
            total_amount, payment_id
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PENDING',
            'PAYPAL', ?, UUID_TO_BIN(?))
          `,
          [purchaseId, user_id, competition_id, finalAmount, paymentId]
        );

        // Return PayPal payment creation response
        return res.json({
          requires_payment: true,
          payment_method: 'PAYPAL',
          payment_id: paymentId,
          purchase_id: purchaseId,
          amount: finalAmount,
          currency: 'GBP',
          competition: {
            id: competition.id,
            title: competition.title,
            price: competition.price,
            quantity: quantity
          },
          voucher_applied: voucherId ? true : false,
          voucher_discount: voucherDiscount,
          message: "Please proceed with PayPal payment"
        });
      } else {
        // Verify PayPal payment is completed
        const [payment] = await connection.query(
          `
          SELECT status, amount, gateway_response
          FROM payments 
          WHERE id = UUID_TO_BIN(?) 
            AND user_id = UUID_TO_BIN(?) 
            AND type = 'TICKET'
            AND gateway = 'PAYPAL'
          FOR UPDATE
          `,
          [payment_id, user_id]
        );

        if (!payment.length) {
          throw new Error("Payment not found");
        }

        if (payment[0].status !== 'COMPLETED') {
          throw new Error(`Payment not completed. Status: ${payment[0].status}`);
        }

        // Verify payment amount matches
        if (parseFloat(payment[0].amount) !== parseFloat(finalAmount)) {
          throw new Error(`Payment amount mismatch. Expected: ${finalAmount}, Got: ${payment[0].amount}`);
        }

        // Get purchase record
        const [purchase] = await connection.query(
          `
          SELECT id FROM purchases 
          WHERE payment_id = UUID_TO_BIN(?)
          FOR UPDATE
          `,
          [payment_id]
        );

        if (!purchase.length) {
          throw new Error("Purchase record not found");
        }

        const purchase_id = purchase[0].id;

        // Allocate tickets
        const allocatedTickets = await this.allocateCompetitionTickets(
          connection,
          user_id,
          competition_id,
          quantity,
          purchase_id,
          false
        );

        // Update competition sold tickets
        await connection.query(
          `
          UPDATE competitions 
          SET sold_tickets = sold_tickets + ? 
          WHERE id = UUID_TO_BIN(?)
          `,
          [quantity, competition_id]
        );

        // Update purchase status
        await connection.query(
          `
          UPDATE purchases 
          SET status = 'PAID',
              updated_at = NOW()
          WHERE id = UUID_TO_BIN(?)
          `,
          [purchase_id]
        );

        // Record transaction
        await this.recordTransaction(connection, {
          user_id,
          type: 'competition_entry',
          amount: finalAmount,
          description: `Ticket purchase for ${competition.title}`,
          reference_table: 'purchases',
          reference_id: purchase_id,
          payment_id: payment_id
        });

        // Record voucher usage if applicable
        if (voucherId) {
          await this.recordVoucherUsage(connection, {
            voucher_id: voucherId,
            user_id,
            payment_id: payment_id,
            used_amount: voucherDiscount
          });
        }

        await connection.commit();

        res.json({
          success: true,
          tickets: allocatedTickets,
          payment: {
            id: payment_id,
            amount: finalAmount,
            status: 'COMPLETED',
            method: 'PAYPAL'
          },
          competition: {
            id: competition.id,
            title: competition.title,
            total_tickets: competition.total_tickets,
            sold_tickets: competition.sold_tickets + quantity,
            tickets_remaining: competition.total_tickets - (competition.sold_tickets + quantity),
            ticket_price: competition.price,
          },
          voucher_applied: voucherId ? true : false,
          voucher_discount: voucherDiscount
        });
      }

    } catch (error) {
      throw error;
    }
  }

  // Handle credit wallet payment
  static async handleCreditWalletPayment(connection, req, res, params) {
    try {
      const { 
        competition, 
        user_id, 
        quantity, 
        competition_id, 
        finalAmount,
        voucherId,
        voucherDiscount
      } = params;

      // Check spending limits
      const limitCheck = await SpendingLimitsService.checkSpendingLimits(
        connection,
        user_id,
        finalAmount,
        'CREDIT_WALLET'
      );

      if (!limitCheck.allowed) {
        throw new Error(`Spending limit exceeded: ${limitCheck.message}`);
      }

      // Deduct from credit wallet
      await this.deductWalletBalance(connection, user_id, 'CREDIT', finalAmount, 'Ticket purchase');

      // Update spending
      await SpendingLimitsService.updateSpending(
        connection,
        user_id,
        finalAmount
      );

      // Create payment record
      const paymentId = uuidv4();
      await connection.query(
        `
        INSERT INTO payments (
          id, user_id, type, reference_id, amount, currency,
          status, gateway, metadata
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), ?, ?, 
          'COMPLETED', 'CREDIT_WALLET', ?)
        `,
        [
          paymentId, 
          user_id, 
          'TICKET', 
          competition_id, 
          finalAmount, 
          'GBP',
          JSON.stringify({
            quantity: quantity,
            competition_title: competition.title,
            ticket_price: competition.price,
            voucher_id: voucherId ? voucherId : null,
            voucher_discount: voucherDiscount,
            original_amount: competition.price * quantity
          })
        ]
      );

      // Create purchase record
      const purchaseId = uuidv4();
      await connection.query(
        `
        INSERT INTO purchases (
          id, user_id, competition_id, status, payment_method,
          total_amount, site_credit_used, payment_id
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PAID',
          'CREDIT_WALLET', ?, ?, UUID_TO_BIN(?))
        `,
        [purchaseId, user_id, competition_id, finalAmount, finalAmount, paymentId]
      );

      // Allocate tickets
      const allocatedTickets = await this.allocateCompetitionTickets(
        connection,
        user_id,
        competition_id,
        quantity,
        purchaseId,
        false
      );

      // Update competition sold tickets
      await connection.query(
        `
        UPDATE competitions 
        SET sold_tickets = sold_tickets + ? 
        WHERE id = UUID_TO_BIN(?)
        `,
        [quantity, competition_id]
      );

      // Record transaction
      await this.recordTransaction(connection, {
        user_id,
        type: 'competition_entry',
        amount: finalAmount,
        description: `Ticket purchase for ${competition.title}`,
        reference_table: 'purchases',
        reference_id: purchaseId,
        payment_id: paymentId
      });

      // Record voucher usage if applicable
      if (voucherId) {
        await this.recordVoucherUsage(connection, {
          voucher_id: voucherId,
          user_id,
          payment_id: paymentId,
          used_amount: voucherDiscount
        });
      }

      await connection.commit();

      res.json({
        success: true,
        tickets: allocatedTickets,
        payment: {
          id: paymentId,
          amount: finalAmount,
          status: 'COMPLETED',
          method: 'CREDIT_WALLET'
        },
        competition: {
          id: competition.id,
          title: competition.title,
          total_tickets: competition.total_tickets,
          sold_tickets: competition.sold_tickets + quantity,
          tickets_remaining: competition.total_tickets - (competition.sold_tickets + quantity),
          ticket_price: competition.price,
        },
        wallet_used: 'CREDIT',
        voucher_applied: voucherId ? true : false,
        voucher_discount: voucherDiscount
      });

    } catch (error) {
      throw error;
    }
  }

  // Handle cash wallet payment
  static async handleCashWalletPayment(connection, req, res, params) {
    try {
      const { 
        competition, 
        user_id, 
        quantity, 
        competition_id, 
        finalAmount,
        voucherId,
        voucherDiscount
      } = params;

      // Check spending limits
      const limitCheck = await SpendingLimitsService.checkSpendingLimits(
        connection,
        user_id,
        finalAmount,
        'CASH_WALLET'
      );

      if (!limitCheck.allowed) {
        throw new Error(`Spending limit exceeded: ${limitCheck.message}`);
      }

      // Deduct from cash wallet
      await this.deductWalletBalance(connection, user_id, 'CASH', finalAmount, 'Ticket purchase');

      // Update spending
      await SpendingLimitsService.updateSpending(
        connection,
        user_id,
        finalAmount
      );

      // Create payment record
      const paymentId = uuidv4();
      await connection.query(
        `
        INSERT INTO payments (
          id, user_id, type, reference_id, amount, currency,
          status, gateway, metadata
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), ?, ?, 
          'COMPLETED', 'CASH_WALLET', ?)
        `,
        [
          paymentId, 
          user_id, 
          'TICKET', 
          competition_id, 
          finalAmount, 
          'GBP',
          JSON.stringify({
            quantity: quantity,
            competition_title: competition.title,
            ticket_price: competition.price,
            voucher_id: voucherId ? voucherId : null,
            voucher_discount: voucherDiscount,
            original_amount: competition.price * quantity
          })
        ]
      );

      // Create purchase record
      const purchaseId = uuidv4();
      await connection.query(
        `
        INSERT INTO purchases (
          id, user_id, competition_id, status, payment_method,
          total_amount, cash_wallet_used, payment_id
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PAID',
          'CASH_WALLET', ?, ?, UUID_TO_BIN(?))
        `,
        [purchaseId, user_id, competition_id, finalAmount, finalAmount, paymentId]
      );

      // Allocate tickets
      const allocatedTickets = await this.allocateCompetitionTickets(
        connection,
        user_id,
        competition_id,
        quantity,
        purchaseId,
        false
      );

      // Update competition sold tickets
      await connection.query(
        `
        UPDATE competitions 
        SET sold_tickets = sold_tickets + ? 
        WHERE id = UUID_TO_BIN(?)
        `,
        [quantity, competition_id]
      );

      // Record transaction
      await this.recordTransaction(connection, {
        user_id,
        type: 'competition_entry',
        amount: finalAmount,
        description: `Ticket purchase for ${competition.title}`,
        reference_table: 'purchases',
        reference_id: purchaseId,
        payment_id: paymentId
      });

      // Record voucher usage if applicable
      if (voucherId) {
        await this.recordVoucherUsage(connection, {
          voucher_id: voucherId,
          user_id,
          payment_id: paymentId,
          used_amount: voucherDiscount
        });
      }

      await connection.commit();

      res.json({
        success: true,
        tickets: allocatedTickets,
        payment: {
          id: paymentId,
          amount: finalAmount,
          status: 'COMPLETED',
          method: 'CASH_WALLET'
        },
        competition: {
          id: competition.id,
          title: competition.title,
          total_tickets: competition.total_tickets,
          sold_tickets: competition.sold_tickets + quantity,
          tickets_remaining: competition.total_tickets - (competition.sold_tickets + quantity),
          ticket_price: competition.price,
        },
        wallet_used: 'CASH',
        voucher_applied: voucherId ? true : false,
        voucher_discount: voucherDiscount
      });

    } catch (error) {
      throw error;
    }
  }

  // Helper method: Apply voucher
  static async applyVoucher(connection, user_id, voucher_code, competition, quantity) {
    try {
      // Check if voucher exists and is valid
      const [voucher] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(id) as id,
          reward_type,
          reward_value,
          usage_limit,
          usage_count,
          start_date,
          expiry_date,
          status
        FROM vouchers 
        WHERE code = ?
          AND status = 'ACTIVE'
          AND start_date <= NOW()
          AND (expiry_date IS NULL OR expiry_date > NOW())
          AND (usage_limit IS NULL OR usage_count < usage_limit)
        FOR UPDATE
        `,
        [voucher_code]
      );

      if (!voucher.length) {
        throw new Error("Invalid or expired voucher code");
      }

      const voucherData = voucher[0];

      // Check if user has already used this voucher
      const [voucherUsage] = await connection.query(
        `
        SELECT COUNT(*) as used_count 
        FROM voucher_usage 
        WHERE voucher_id = UUID_TO_BIN(?) 
          AND user_id = UUID_TO_BIN(?)
        `,
        [voucherData.id, user_id]
      );

      if (voucherUsage[0].used_count > 0 && voucherData.reward_type !== 'MULTI_USE') {
        throw new Error("Voucher already used");
      }

      let discount = 0;
      let finalAmount = competition.price * quantity;

      // Apply discount based on voucher type
      switch(voucherData.reward_type) {
        case 'DISCOUNT_PERCENT':
          discount = finalAmount * (voucherData.reward_value / 100);
          finalAmount = finalAmount - discount;
          break;
        case 'DISCOUNT_FIXED':
          discount = Math.min(voucherData.reward_value, finalAmount);
          finalAmount = finalAmount - discount;
          break;
        case 'FREE_ENTRY':
          if (quantity > 1) {
            throw new Error("Free entry voucher can only be used for single ticket");
          }
          discount = finalAmount;
          finalAmount = 0;
          break;
        case 'SITE_CREDIT':
          // This would add credit to wallet, not discount tickets
          throw new Error("Site credit vouchers cannot be used for ticket purchases");
        default:
          throw new Error("Unsupported voucher type for ticket purchase");
      }

      // Ensure final amount is not negative
      if (finalAmount < 0) {
        finalAmount = 0;
      }

      return {
        voucherId: voucherData.id,
        discount: discount,
        finalAmount: finalAmount,
        voucherType: voucherData.reward_type
      };

    } catch (error) {
      throw error;
    }
  }

  // Helper method: Record voucher usage
  static async recordVoucherUsage(connection, params) {
    const { voucher_id, user_id, payment_id, used_amount } = params;
    
    const usageId = uuidv4();
    await connection.query(
      `
      INSERT INTO voucher_usage (
        id, voucher_id, user_id, payment_id, used_amount
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?)
      `,
      [usageId, voucher_id, user_id, payment_id, used_amount]
    );
  }

  // Helper method: Deduct wallet balance
  static async deductWalletBalance(connection, user_id, wallet_type, amount, description) {
    const [wallet] = await connection.query(
      `
      SELECT id, balance FROM wallets 
      WHERE user_id = UUID_TO_BIN(?) AND type = ?
      FOR UPDATE
      `,
      [user_id, wallet_type]
    );

    if (!wallet || wallet.length === 0) {
      throw new Error(`${wallet_type} wallet not found`);
    }

    if (wallet[0].balance < amount) {
      throw new Error(`Insufficient ${wallet_type.toLowerCase()} balance`);
    }

    // Update wallet balance
    await connection.query(
      `
      UPDATE wallets 
      SET balance = balance - ?, updated_at = NOW()
      WHERE id = UUID_TO_BIN(?)
      `,
      [amount, wallet[0].id]
    );

    // Record wallet transaction
    const transactionId = uuidv4();
    await connection.query(
      `
      INSERT INTO wallet_transactions (
        id, wallet_id, amount, type, reference, description
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'DEBIT', UUID_TO_BIN(?), ?)
      `,
      [transactionId, wallet[0].id, amount, uuidv4(), description]
    );
  }

  // Helper method: Record transaction
  static async recordTransaction(connection, params) {
    const { user_id, type, amount, description, reference_table, reference_id, payment_id } = params;
    
    const transactionId = uuidv4();
    await connection.query(
      `
      INSERT INTO transactions (
        id, user_id, type, amount, currency, status,
        description, reference_table, reference_id,
        payment_id, completed_at
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'GBP', 'completed',
        ?, ?, UUID_TO_BIN(?), UUID_TO_BIN(?), NOW())
      `,
      [transactionId, user_id, type, amount, description, reference_table, reference_id, payment_id]
    );
  }

  // Universal tickets allocation (existing method - updated)
  static async useUniversalTickets(
    connection,
    user_id,
    competition_id,
    quantity
  ) {
    const [universalTickets] = await connection.query(
      `
      SELECT BIN_TO_UUID(id) as id 
      FROM universal_tickets 
      WHERE user_id = UUID_TO_BIN(?) 
      AND is_used = FALSE 
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at
      LIMIT ?
      FOR UPDATE SKIP LOCKED
      `,
      [user_id, quantity]
    );

    if (universalTickets.length < quantity) {
      throw new Error(
        `Insufficient universal tickets. Available: ${universalTickets.length}, Required: ${quantity}`
      );
    }

    const allocatedTickets = [];

    for (let i = 0; i < quantity; i++) {
      const universalTicket = universalTickets[i];
      const ticket_number = await this.getNextTicketNumber(
        connection,
        competition_id
      );

      const ticketId = uuidv4();
      await connection.query(
        `
        INSERT INTO tickets (
          id, competition_id, user_id, ticket_number, 
          ticket_type, universal_ticket_id, is_used
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'UNIVERSAL', UUID_TO_BIN(?), TRUE)
        `,
        [ticketId, competition_id, user_id, ticket_number, universalTicket.id]
      );

      await connection.query(
        `
        UPDATE universal_tickets 
        SET is_used = TRUE, used_at = NOW() 
        WHERE id = UUID_TO_BIN(?)
        `,
        [universalTicket.id]
      );

      // Check for instant win
      const isInstantWin = await this.checkInstantWin(
        connection,
        competition_id,
        ticket_number,
        user_id
      );

      allocatedTickets.push({
        id: ticketId,
        ticket_number,
        is_instant_win: isInstantWin,
        ticket_type: "UNIVERSAL",
        universal_ticket_id: universalTicket.id,
      });
    }

    return allocatedTickets;
  }

  // Competition tickets allocation (existing method - updated)
  static async allocateCompetitionTickets(
    connection,
    user_id,
    competition_id,
    quantity,
    purchase_id = null,
    is_free_entry = false
  ) {
    const allocatedTickets = [];

    for (let i = 0; i < quantity; i++) {
      const ticket_number = await this.getNextTicketNumber(
        connection,
        competition_id
      );
      const ticketId = uuidv4();

      // Check for instant win
      const isInstantWin = await this.checkInstantWin(
        connection,
        competition_id,
        ticket_number,
        user_id
      );

      await connection.query(
        `
        INSERT INTO tickets (
          id, competition_id, user_id, ticket_number,
          purchase_id, ticket_type, is_instant_win, is_free_entry
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'COMPETITION', ?, ?)
        `,
        [
          ticketId,
          competition_id,
          user_id,
          ticket_number,
          purchase_id,
          isInstantWin,
          is_free_entry
        ]
      );

      allocatedTickets.push({
        id: ticketId,
        ticket_number,
        is_instant_win: isInstantWin,
        ticket_type: "COMPETITION",
        is_free_entry: is_free_entry,
        purchase_id: purchase_id
      });
    }

    return allocatedTickets;
  }

  // Get next ticket number (existing method)
  static async getNextTicketNumber(connection, competition_id) {
    const [result] = await connection.query(
      `
      SELECT COALESCE(MAX(ticket_number), 0) + 1 as next_number
      FROM tickets 
      WHERE competition_id = UUID_TO_BIN(?)
      `,
      [competition_id]
    );

    return result[0].next_number;
  }

  // Check instant win (existing method)
  static async checkInstantWin(
    connection,
    competition_id,
    ticket_number,
    user_id
  ) {
    const [instantWin] = await connection.query(
      `
      SELECT BIN_TO_UUID(id) as id 
      FROM instant_wins 
      WHERE competition_id = UUID_TO_BIN(?) 
      AND ticket_number = ?
      AND claimed_by IS NULL
      AND current_winners < max_winners
      FOR UPDATE SKIP LOCKED
      `,
      [competition_id, ticket_number]
    );

    if (instantWin.length > 0) {
      // You'll need to import or implement processInstantWin
      // await processInstantWin(connection, instantWin[0].id, user_id);
      return true;
    }

    return false;
  }

  // Add this new method for bulk ticket allocation
  static async allocateBulkTickets(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult = ticketSchemas.allocateBulkTickets.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid request data",
          details: validationResult.error.errors,
        });
      }

      const {
        allocations, // Array of {competition_id, quantity}
        payment_method,
        payment_id,
        voucher_code
      } = validationResult.data;
      
      const user_id = req.user.id;

      // Validate all competitions first
      let totalAmount = 0;
      const competitionDetails = [];

      for (const allocation of allocations) {
        const [competition] = await connection.query(
          `
          SELECT 
            BIN_TO_UUID(id) AS id,
            title,
            price,
            total_tickets,
            sold_tickets,
            max_entries_per_user
          FROM competitions 
          WHERE id = UUID_TO_BIN(?)
            AND status = 'ACTIVE'
          FOR UPDATE
          `,
          [allocation.competition_id]
        );

        if (!competition.length) {
          throw new Error(`Competition ${allocation.competition_id} not found or inactive`);
        }

        const comp = competition[0];

        // Check max entries per user
        const [userTickets] = await connection.query(
          `
          SELECT COUNT(*) as count 
          FROM tickets 
          WHERE competition_id = UUID_TO_BIN(?) 
            AND user_id = UUID_TO_BIN(?)
          `,
          [allocation.competition_id, user_id]
        );

        if (comp.max_entries_per_user && userTickets[0].count + allocation.quantity > comp.max_entries_per_user) {
          throw new Error(
            `Maximum ${comp.max_entries_per_user} tickets allowed per user for competition: ${comp.title}`
          );
        }

        // Check if competition has enough tickets
        if (comp.total_tickets && (comp.sold_tickets + allocation.quantity > comp.total_tickets)) {
          throw new Error(`Competition ${comp.title} is sold out`);
        }

        totalAmount += comp.price * allocation.quantity;
        competitionDetails.push({
          ...comp,
          quantity: allocation.quantity
        });
      }

      // Apply voucher if provided
      let voucherDiscount = 0;
      let voucherId = null;
      let finalAmount = totalAmount;
      
      if (voucher_code) {
        // For bulk purchases, we need a different voucher handling
        // This is simplified - you might want to implement specific bulk voucher logic
        const voucherResult = await this.applyBulkVoucher(connection, user_id, voucher_code, competitionDetails);
        voucherDiscount = voucherResult.discount;
        voucherId = voucherResult.voucherId;
        finalAmount = voucherResult.finalAmount;
      }

      // Handle payment based on method
      if (payment_method === 'PAYPAL') {
        return await this.handleBulkPayPalPayment(connection, req, res, {
          user_id,
          competitionDetails,
          finalAmount,
          payment_id,
          voucherId,
          voucherDiscount
        });
      } else if (payment_method === 'CREDIT_WALLET') {
        return await this.handleBulkCreditWalletPayment(connection, req, res, {
          user_id,
          competitionDetails,
          finalAmount,
          voucherId,
          voucherDiscount
        });
      } else {
        throw new Error(`Unsupported payment method for bulk purchase: ${payment_method}`);
      }

    } catch (error) {
      await connection.rollback();
      console.error("Bulk allocate tickets error:", error);
      res.status(400).json({
        error: error.message,
        code: error.code || "BULK_TICKET_ALLOCATION_ERROR",
      });
    } finally {
      connection.release();
    }
  }
  static async useUniversalTickets(
    connection,
    user_id,
    competition_id,
    quantity
  ) {
    const [universalTickets] = await connection.query(
      `
      SELECT BIN_TO_UUID(id) as id 
      FROM universal_tickets 
      WHERE user_id = UUID_TO_BIN(?) 
      AND is_used = FALSE 
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at
      LIMIT ?
      FOR UPDATE SKIP LOCKED
      `,
      [user_id, quantity]
    );

    if (universalTickets.length < quantity) {
      throw new Error(
        `Insufficient universal tickets. Available: ${universalTickets.length}, Required: ${quantity}`
      );
    }

    const allocatedTickets = [];

    for (let i = 0; i < quantity; i++) {
      const universalTicket = universalTickets[i];
      const ticket_number = await this.getNextTicketNumber(
        connection,
        competition_id
      );

      const ticketId = uuidv4();
      await connection.query(
        `
        INSERT INTO tickets (
          id, competition_id, user_id, ticket_number, 
          ticket_type, universal_ticket_id, is_used
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'UNIVERSAL', UUID_TO_BIN(?), TRUE)
        `,
        [ticketId, competition_id, user_id, ticket_number, universalTicket.id]
      );

      await connection.query(
        `
        UPDATE universal_tickets 
        SET is_used = TRUE, used_at = NOW() 
        WHERE id = UUID_TO_BIN(?)
        `,
        [universalTicket.id]
      );

      const isInstantWin = await this.checkInstantWin(
        connection,
        competition_id,
        ticket_number,
        user_id
      );

      allocatedTickets.push({
        id: ticketId,
        ticket_number,
        is_instant_win: isInstantWin,
        ticket_type: "UNIVERSAL",
        universal_ticket_id: universalTicket.id,
      });
    }

    return allocatedTickets;
  }

  static async allocateCompetitionTickets(
    connection,
    user_id,
    competition_id,
    quantity,
    purchase_id
  ) {
    const allocatedTickets = [];

    for (let i = 0; i < quantity; i++) {
      const ticket_number = await this.getNextTicketNumber(
        connection,
        competition_id
      );
      const ticketId = uuidv4();

      const isInstantWin = await this.checkInstantWin(
        connection,
        competition_id,
        ticket_number,
        user_id
      );

      await connection.query(
        `
        INSERT INTO tickets (
          id, competition_id, user_id, ticket_number,
          purchase_id, ticket_type, is_instant_win
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'COMPETITION', ?)
        `,
        [
          ticketId,
          competition_id,
          user_id,
          ticket_number,
          purchase_id,
          isInstantWin,
        ]
      );

      allocatedTickets.push({
        id: ticketId,
        ticket_number,
        is_instant_win: isInstantWin,
        ticket_type: "COMPETITION",
      });
    }

    return allocatedTickets;
  }

  static async getNextTicketNumber(connection, competition_id) {
    const [result] = await connection.query(
      `
      SELECT COALESCE(MAX(ticket_number), 0) + 1 as next_number
      FROM tickets 
      WHERE competition_id = UUID_TO_BIN(?)
      FOR UPDATE
      `,
      [competition_id]
    );

    return result[0].next_number;
  }

  static async checkInstantWin(
    connection,
    competition_id,
    ticket_number,
    user_id
  ) {
    const [instantWin] = await connection.query(
      `
      SELECT BIN_TO_UUID(id) as id 
      FROM instant_wins 
      WHERE competition_id = UUID_TO_BIN(?) 
      AND ticket_number = ?
      AND claimed_by IS NULL
      AND current_winners < max_winners
      FOR UPDATE SKIP LOCKED
      `,
      [competition_id, ticket_number]
    );

    if (instantWin.length > 0) {
      await processInstantWin(connection, instantWin[0].id, user_id);
      return true;
    }

    return false;
  }

  static async getUserTickets(req, res) {
    const connection = await pool.getConnection();

    try {
      const user_id = req.user.id;
      // const user_id = "44314444-5555-6666-7777-888888888888";
      const { competition_id, ticket_type, include_instant_wins } = req.query;

      let query = `
        SELECT 
          BIN_TO_UUID(t.id) as id,
          BIN_TO_UUID(t.competition_id) as competition_id,
          BIN_TO_UUID(t.user_id) as user_id,
          BIN_TO_UUID(t.universal_ticket_id) as universal_ticket_id,
          BIN_TO_UUID(t.purchase_id) as purchase_id,
          t.ticket_number,
          t.ticket_type,
          t.is_instant_win,
          t.is_used,
          t.created_at,
          c.title as competition_title,
          c.featured_image,
          c.status as competition_status,
          iw.prize_name as instant_win_prize,
          iw.prize_value as instant_win_value
        FROM tickets t
        JOIN competitions c ON t.competition_id = c.id
        LEFT JOIN instant_wins iw ON t.competition_id = iw.competition_id 
          AND t.ticket_number = iw.ticket_number
          AND iw.claimed_by = t.user_id
        WHERE t.user_id = UUID_TO_BIN(?)
      `;

      const params = [user_id];

      if (competition_id) {
        query += ` AND t.competition_id = UUID_TO_BIN(?)`;
        params.push(competition_id);
      }

      if (ticket_type) {
        query += ` AND t.ticket_type = ?`;
        params.push(ticket_type);
      }

      if (include_instant_wins === "true") {
        query += ` AND t.is_instant_win = TRUE`;
      }

      query += ` ORDER BY t.created_at DESC`;

      const [tickets] = await connection.query(query, params);

      res.json({
        total: tickets.length,
        tickets,
      });
    } catch (error) {
      console.error("Get user tickets error:", error);
      res.status(500).json({
        error: "Failed to fetch tickets",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async awardUniversalTickets(req, res) {
    const { user_id, source, quantity, expires_at = null } = req.body;

    if (!user_id || !source || !quantity) {
      return res.status(400).json({
        error: "Missing required fields: user_id, source, or quantity",
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const ticketIds = [];

      for (let i = 0; i < quantity; i++) {
        const ticketId = uuidv4();
        await connection.query(
          `
          INSERT INTO universal_tickets (
            id, user_id, source, expires_at
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)
          `,
          [ticketId, user_id, source, expires_at]
        );
        ticketIds.push(ticketId);
      }

      await connection.commit();

      res.json({
        success: true,
        message: `${quantity} universal ticket(s) awarded`,
        tickets: ticketIds,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Award universal tickets error:", error);
      res.status(500).json({
        error: "Failed to award universal tickets",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async awardUniversalTicketsWithTransaction(
    connection,
    user_id,
    source,
    quantity,
    expires_at = null
  ) {
    const ticketIds = [];

    for (let i = 0; i < quantity; i++) {
      const ticketId = uuidv4();
      await connection.query(
        `
        INSERT INTO universal_tickets (
          id, user_id, source, expires_at
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)
        `,
        [ticketId, user_id, source, expires_at]
      );

      ticketIds.push(ticketId);
    }

    return ticketIds;
  }

  static async getUniversalTicketsBalance(req, res) {
    const connection = await pool.getConnection();

    try {
      const user_id = req.user.id;
      // const user_id = "33333333-4444-5555-6666-777777777777";
      const { include_expired = false } = req.query;

      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_used = TRUE THEN 1 END) as used,
          COUNT(CASE WHEN is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END) as available,
          COUNT(CASE WHEN is_used = FALSE AND expires_at <= NOW() THEN 1 END) as expired,
          GROUP_CONCAT(DISTINCT source) as sources
        FROM universal_tickets
        WHERE user_id = UUID_TO_BIN(?)
      `;

      if (!include_expired) {
        query += ` AND (expires_at IS NULL OR expires_at > NOW())`;
      }

      const [balance] = await connection.query(query, [user_id]);

      const [breakdown] = await connection.query(
        `
        SELECT 
          source,
          COUNT(*) as total,
          COUNT(CASE WHEN is_used = TRUE THEN 1 END) as used,
          COUNT(CASE WHEN is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END) as available
        FROM universal_tickets
        WHERE user_id = UUID_TO_BIN(?)
        GROUP BY source
        ORDER BY source
        `,
        [user_id]
      );

      res.json({
        balance: balance[0] || {
          total: 0,
          used: 0,
          available: 0,
          expired: 0,
          sources: null,
        },
        breakdown,
      });
    } catch (error) {
      console.error("Get universal tickets balance error:", error);
      res.status(500).json({
        error: "Failed to fetch universal tickets balance",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async deductSiteCredit(connection, user_id, amount) {
    const [wallet] = await connection.query(
      `
      SELECT balance FROM wallets 
      WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
      FOR UPDATE
      `,
      [user_id]
    );

    if (!wallet || wallet.length === 0 || wallet[0].balance < amount) {
      throw new Error("Insufficient site credit balance");
    }

    await connection.query(
      `
      UPDATE wallets 
      SET balance = balance - ?, updated_at = NOW()
      WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
      `,
      [amount, user_id]
    );

    const transactionId = uuidv4();
    await connection.query(
      `
      INSERT INTO wallet_transactions (
        id, wallet_id, amount, type, reference, description
      ) SELECT UUID_TO_BIN(?), id, ?, 'DEBIT', UUID_TO_BIN(?), ?
      FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
      `,
      [transactionId, amount, uuidv4(), "Ticket purchase", user_id]
    );
  }

  static async getCompetitionTicketStats(req, res) {
    const connection = await pool.getConnection();

    try {
      const { competition_id } = req.params;
      const user_id = req.user.id;
      // const user_id = "33333333-4444-5555-6666-777777777777";

      const [stats] = await connection.query(
        `
        SELECT 
          COUNT(*) as user_total_tickets,
          COUNT(CASE WHEN is_instant_win = TRUE THEN 1 END) as user_instant_wins,
          COUNT(CASE WHEN is_used = TRUE THEN 1 END) as user_used_tickets,
          MIN(ticket_number) as user_min_ticket,
          MAX(ticket_number) as user_max_ticket
        FROM tickets
        WHERE competition_id = UUID_TO_BIN(?) 
          AND user_id = UUID_TO_BIN(?)
        `,
        [competition_id, user_id]
      );

      const [compStats] = await connection.query(
        `
        SELECT 
          COUNT(*) as total_tickets_sold,
          sold_tickets,
          total_tickets,
          (total_tickets - sold_tickets) as tickets_remaining
        FROM competitions
        WHERE id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );

      res.json({
        user_stats: stats[0] || {
          user_total_tickets: 0,
          user_instant_wins: 0,
          user_used_tickets: 0,
          user_min_ticket: null,
          user_max_ticket: null,
        },
        competition_stats: compStats[0] || {
          total_tickets_sold: 0,
          sold_tickets: 0,
          total_tickets: 0,
          tickets_remaining: 0,
        },
      });
    } catch (error) {
      console.error("Get competition ticket stats error:", error);
      res.status(500).json({
        error: "Failed to fetch competition ticket statistics",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

export default TicketSystemController;
