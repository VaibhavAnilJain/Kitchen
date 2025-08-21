const express = require("express");
const router = express.Router();
const {
  createMealPlan,
  getMealPlans,
  getMealPlanById,
  getAvailableMeals,
  checkMealPlanStock,
  checkMealPlanResources,
  deleteMealPlan,
  updateMealPlan
} = require("../controllers/mealPlanController");

const { isAuthenticated, isAdmin } = require("../middleware/auth");

// Meal planning routes
// Allow customers to view meal plans (GET), but only admins can create/modify
router.post("/meal-plans", isAuthenticated, isAdmin, createMealPlan);
router.get("/meal-plans", isAuthenticated, getMealPlans); // Removed isAdmin - customers can view
router.get("/meal-plans/:id", isAuthenticated, getMealPlanById); // Get single meal plan by ID
router.get("/meal-plans/:id/check-stock", isAuthenticated, isAdmin, checkMealPlanStock);
router.get("/meal-plans/:id/check-resources", isAuthenticated, isAdmin, checkMealPlanResources);
router.put("/meal-plans/:id", isAuthenticated, updateMealPlan);
router.delete("/meal-plans/:id", isAuthenticated, isAdmin, deleteMealPlan);

// Available meals for planning
router.get("/available-meals", isAuthenticated, getAvailableMeals);

module.exports = router; 