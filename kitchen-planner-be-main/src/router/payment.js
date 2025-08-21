const express = require("express");
const router = express.Router();
const {
  createPayment,
  getAllPayments,
  getPaymentById,
  getPaymentsByOrderId,
  getPaymentsByCustomerId,
  updatePaymentStatus,
  processRefund,
  getPaymentStats,
  deletePayment,
} = require("../controllers/paymentController");
const { createPaymentIntent } = require("../controllers/paymentcontrollerforstripe"); // Import createPaymentIntent
const { isAuthenticated, isAdmin } = require("../middleware/auth");

// Protected routes
router.post("/", isAuthenticated, createPayment);
router.post("/stripe/create-payment-intent", isAuthenticated, createPaymentIntent); // New Stripe route
router.get("/", isAuthenticated, isAdmin, getAllPayments);
router.get("/stats", isAuthenticated, isAdmin, getPaymentStats);
router.get("/:id", isAuthenticated, getPaymentById);
router.get("/order/:orderId", isAuthenticated, getPaymentsByOrderId);
router.get("/customer/:customerId", isAuthenticated, getPaymentsByCustomerId);
router.put("/:id/status", isAuthenticated, isAdmin, updatePaymentStatus);
router.post("/:id/refund", isAuthenticated, isAdmin, processRefund);
router.delete("/:id", isAuthenticated, isAdmin, deletePayment);

module.exports = router; 