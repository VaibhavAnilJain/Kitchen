const Payment = require("../models/User/payment");
const Order = require("../models/User/order");
const Customer = require("../models/User/customer");
const ApiError = require("../utils/ApiError");
const SuccessHandler = require("../utils/SuccessHandler");

// Create a new payment
const createPayment = async (req, res, next) => {
  try {
    const {
      orderId,
      customerId,
      amount,
      currency,
      type,
      method,
      paymentDetails,
      billingAddress,
      fees,
      metadata,
    } = req.body;

    // Validate order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return next(new ApiError("Order not found", 404));
    }

    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return next(new ApiError("Customer not found", 404));
    }

    // Check if payment already exists for this order
    const existingPayment = await Payment.findOne({ order: orderId });
    if (existingPayment) {
      return next(new ApiError("Payment already exists for this order", 400));
    }

    const payment = new Payment({
      order: orderId,
      customer: customerId,
      amount,
      currency,
      type,
      method,
      paymentDetails,
      billingAddress,
      fees,
      metadata,
    });

    await payment.save();

    // Update order with payment reference
    order.payment = payment._id;
    await order.save();

    // Populate references
    await payment.populate([
      { path: "order", select: "orderId total status" },
      { path: "customer", select: "customerId billingInfo" },
    ]);

    SuccessHandler(res, "Payment created successfully", payment, 201);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Get all payments
const getAllPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, type, method, startDate, endDate } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (method) query.method = method;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const payments = await Payment.find(query)
      .populate("order", "orderId total status")
      .populate("customer", "customerId billingInfo")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Payment.countDocuments(query);

    SuccessHandler(res, "Payments retrieved successfully", {
      payments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Get payment by ID
const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id)
      .populate("order", "orderId total status meals")
      .populate("customer", "customerId billingInfo preferences");

    if (!payment) {
      return next(new ApiError("Payment not found", 404));
    }

    SuccessHandler(res, "Payment retrieved successfully", payment);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Get payments by order ID
const getPaymentsByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const payments = await Payment.find({ order: orderId })
      .populate("order", "orderId total status")
      .populate("customer", "customerId billingInfo")
      .sort({ createdAt: -1 });

    SuccessHandler(res, "Payments retrieved successfully", payments);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Get payments by customer ID
const getPaymentsByCustomerId = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const payments = await Payment.find({ customer: customerId })
      .populate("order", "orderId total status")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Payment.countDocuments({ customer: customerId });

    SuccessHandler(res, "Customer payments retrieved successfully", {
      payments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Update payment status
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) {
      return next(new ApiError("Payment not found", 404));
    }

    // Validate status transition
    const validTransitions = {
      pending: ["processing", "completed", "failed", "cancelled"],
      processing: ["completed", "failed"],
      completed: ["refunded"],
      failed: ["pending"],
      cancelled: ["pending"],
      refunded: [],
    };

    if (!validTransitions[payment.status].includes(status)) {
      return next(new ApiError(`Invalid status transition from ${payment.status} to ${status}`, 400));
    }

    payment.status = status;
    if (notes) payment.notes = notes;

    await payment.save();

    // Update order status if payment is completed
    if (status === "completed") {
      const order = await Order.findById(payment.order);
      if (order && order.status === "pending") {
        order.status = "confirmed";
        await order.save();
      }
    }

    await payment.populate([
      { path: "order", select: "orderId total status" },
      { path: "customer", select: "customerId billingInfo" },
    ]);

    SuccessHandler(res, "Payment status updated successfully", payment);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Process refund
const processRefund = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { refundAmount, reason } = req.body;

    if (!refundAmount || refundAmount <= 0) {
      return next(new ApiError("Invalid refund amount", 400));
    }

    const payment = await Payment.findById(id);
    if (!payment) {
      return next(new ApiError("Payment not found", 404));
    }

    if (payment.status !== "completed") {
      return next(new ApiError("Only completed payments can be refunded", 400));
    }

    await payment.processRefund(refundAmount, reason);

    // Update order status if full refund
    if (payment.refundInfo.refundedAmount >= payment.amount) {
      const order = await Order.findById(payment.order);
      if (order) {
        order.status = "refunded";
        await order.save();
      }
    }

    await payment.populate([
      { path: "order", select: "orderId total status" },
      { path: "customer", select: "customerId billingInfo" },
    ]);

    SuccessHandler(res, "Refund processed successfully", payment);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Get payment statistics
const getPaymentStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const stats = await Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          averageAmount: { $avg: "$amount" },
          completedPayments: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          failedPayments: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
          },
          refundedPayments: {
            $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] }
          },
          totalRefundedAmount: { $sum: "$refundInfo.refundedAmount" },
        }
      }
    ]);

    // Get payment method distribution
    const methodStats = await Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$method",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get payment type distribution
    const typeStats = await Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = {
      ...stats[0],
      methodDistribution: methodStats,
      typeDistribution: typeStats,
    };

    SuccessHandler(res, "Payment statistics retrieved successfully", result);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

// Delete payment
const deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id);
    if (!payment) {
      return next(new ApiError("Payment not found", 404));
    }

    // Only allow deletion of pending or failed payments
    if (!["pending", "failed"].includes(payment.status)) {
      return next(new ApiError("Cannot delete completed or refunded payments", 400));
    }

    await Payment.findByIdAndDelete(id);

    SuccessHandler(res, "Payment deleted successfully", null);
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

module.exports = {
  createPayment,
  getAllPayments,
  getPaymentById,
  getPaymentsByOrderId,
  getPaymentsByCustomerId,
  updatePaymentStatus,
  processRefund,
  getPaymentStats,
  deletePayment,
}; 