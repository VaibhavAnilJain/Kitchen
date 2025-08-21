const stripe = require('stripe');
const fs = require('fs');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.error("Error: STRIPE_SECRET_KEY is not defined in environment variables.");
  // You might want to throw an error here or handle it gracefully
}

const stripeInstance = stripe(stripeSecretKey);

const Payment = require('../models/User/payment');
const Order = require('../models/User/order');
const Customer = require('../models/User/customer');
const ApiError = require('../utils/ApiError');
const SuccessHandler = require('../utils/SuccessHandler');

const createPaymentIntent = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return next(new ApiError('Order not found', 404));
    }

    const customer = await Customer.findById(order.customer);
    if (!customer) {
      return next(new ApiError('Customer not found', 404));
    }

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: order.total * 100, // Amount in cents
      currency: 'usd',
      metadata: { orderId: order._id.toString() },
      // return_url: 'https://example.com/return', // Keep this if your Stripe Dashboard requires it for automatic payment methods
    });

    const payment = new Payment({
      order: orderId,
      customer: order.customer,
      amount: order.total,
      currency: 'USD',
      type: 'stripe',
      method: 'stripe_wallet',
      status: 'pending', // Initial status when created
      paymentDetails: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      },
    });

    await payment.save();

    SuccessHandler({ clientSecret: paymentIntent.client_secret }, 200, res);
  } catch (error) {
    // fs.appendFileSync('errorlog.txt', `[${new Date().toISOString()}] Stripe Payment Intent creation failed: ${error.message}\n${error.stack}\n\n`);
    next(new ApiError(error.message, 500));
  }
};

const stripeWebhook = async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // fs.appendFileSync('errorlog.txt', `[${new Date().toISOString()}] Stripe Webhook Error: ${err.message}\n${err.stack}\n\n`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntentSucceeded = event.data.object;
      await handlePaymentIntentStatusUpdate(paymentIntentSucceeded, 'completed');
      break;
    case 'payment_intent.payment_failed':
      const paymentIntentFailed = event.data.object;
      await handlePaymentIntentStatusUpdate(paymentIntentFailed, 'failed');
      break;
    case 'payment_intent.canceled':
      const paymentIntentCanceled = event.data.object;
      await handlePaymentIntentStatusUpdate(paymentIntentCanceled, 'cancelled');
      break;
    case 'payment_intent.processing':
      const paymentIntentProcessing = event.data.object;
      await handlePaymentIntentStatusUpdate(paymentIntentProcessing, 'processing');
      break;
    case 'payment_intent.requires_action':
      const paymentIntentRequiresAction = event.data.object;
      // For 'requires_action', you might keep it as 'pending' or introduce a new 'requires_action' status if your enum allows
      // For now, we'll treat it as pending as it's awaiting user action
      await handlePaymentIntentStatusUpdate(paymentIntentRequiresAction, 'pending');
      break;
    case 'charge.refunded':
      const chargeRefunded = event.data.object;
      await handleChargeRefunded(chargeRefunded);
      break;
    // Add more cases for other relevant webhook events if needed
    // For example: 'charge.succeeded', 'charge.failed', 'payment_intent.created' (though 'pending' is default)
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).json({ received: true });
};

// --- Consolidated Helper function to update payment and order status ---

async function handlePaymentIntentStatusUpdate(paymentIntent, newPaymentStatus) {
  const payment = await Payment.findOne({ "paymentDetails.paymentIntentId": paymentIntent.id });

  if (payment) {
    payment.status = newPaymentStatus;

    // Only update transactionId and receiptUrl if the payment succeeded and charges data is available
    if (newPaymentStatus === 'completed' && paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0) {
      payment.paymentDetails.transactionId = paymentIntent.charges.data[0].id;
      payment.paymentDetails.receiptUrl = paymentIntent.charges.data[0].receipt_url;
    }
    await payment.save();

    const order = await Order.findById(payment.order);
    if (order) {
      // Map payment status to order status as per your application's logic
      let newOrderStatus = order.status; // Keep current status by default

      if (newPaymentStatus === 'completed') {
        newOrderStatus = 'confirmed'; // Or 'paid', 'fulfilled'
      } else if (newPaymentStatus === 'failed') {
        newOrderStatus = 'cancelled'; // Or 'payment_failed'
      } else if (newPaymentStatus === 'cancelled') {
        newOrderStatus = 'cancelled'; // Or 'order_cancelled'
      } else if (newPaymentStatus === 'processing') {
        newOrderStatus = 'pending'; // Or 'payment_processing'
      }
      // For 'pending' (which includes 'requires_action'), order status might remain 'pending' or 'awaiting_payment'

      if (order.status !== newOrderStatus) { // Only save if status actually changes
        order.status = newOrderStatus;
        await order.save();
      }
    }
  }
}

async function handleChargeRefunded(charge) {
  const payment = await Payment.findOne({ "paymentDetails.transactionId": charge.id });

  if (payment) {
    // Check if it's a full or partial refund
    if (charge.amount_refunded === charge.amount) {
      payment.status = 'refunded';
    } else {
      // If your enum doesn't have 'partially_refunded', you might just keep 'refunded' or 'processing'
      payment.status = 'refunded'; // Assuming 'refunded' covers partial for now
    }
    await payment.save();

    const order = await Order.findById(payment.order);
    if (order) {
      let newOrderStatus = order.status;
      if (payment.status === 'refunded') {
        newOrderStatus = 'refunded'; // Map refunded payment to refunded order status
      }
      if (order.status !== newOrderStatus) {
        order.status = newOrderStatus;
        await order.save();
      }
    }
  }
}


module.exports = {
  createPaymentIntent,
  stripeWebhook,
};