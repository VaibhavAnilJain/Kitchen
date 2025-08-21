const SuccessHandler = require("../utils/SuccessHandler");
const ErrorHandler = require("../utils/ErrorHandler");
const MealPlan = require("../models/Meals/mealPlan");
const Meal = require("../models/Meals/meals");
const MealIngredient = require("../models/Meals/mealIngredient");
const IngredientBatch = require("../models/Meals/ingredientBatch");
const User = require("../models/User/user");

// Helper function to deduct stock for meal plan
const deductStockForMealPlan = async (meals) => {
  try {
    console.log('Starting stock deduction for meal plan with meals:', meals);
    
    for (const mealEntry of meals) {
      const { mealId, servings = 1 } = mealEntry;
      console.log(`Processing meal ${mealId} with ${servings} servings`);
      
      // Get meal ingredients
      const mealIngredients = await MealIngredient.find({ mealId }).populate('ingredientId');
      console.log(`Found ${mealIngredients.length} ingredients for meal ${mealId}`);
      
      for (const mealIngredient of mealIngredients) {
        const ingredient = mealIngredient.ingredientId;
        
        // Calculate proportional stock deduction based on servings
        // mealIngredient.quantity = total quantity needed for the meal's full servings
        // servings = how many servings we want from this meal plan
        // We need to calculate the proportion: (plan servings / meal servings) * total ingredient quantity
        
        // First, get the meal to know its total servings
        const meal = await Meal.findById(mealId);
        if (!meal) {
          throw new Error(`Meal ${mealId} not found`);
        }
        
        const mealTotalServings = meal.servings;
        const planServings = servings;
        
        // Calculate proportional quantity: if meal serves 10 and plan wants 5, use 50% of ingredient quantity
        const proportionalQuantity = (planServings / mealTotalServings) * mealIngredient.quantity;
        
        // Convert ingredient stock from packages to base units for comparison
        const stockInBaseUnits = ingredient.stock * ingredient.packagingQuantity;
        
        console.log(`Processing ingredient: ${ingredient.name}`);
        console.log(`  - Meal total servings: ${mealTotalServings}`);
        console.log(`  - Plan servings: ${planServings}`);
        console.log(`  - Total ingredient quantity: ${mealIngredient.quantity} ${mealIngredient.unit}`);
        console.log(`  - Proportional quantity needed: ${proportionalQuantity.toFixed(2)} ${mealIngredient.unit}`);
        console.log(`  - Current stock: ${ingredient.stock} ${ingredient.packagingUnit} (${stockInBaseUnits} ${ingredient.baseUnit})`);
        
        // Check if enough stock is available (compare in base units)
        if (stockInBaseUnits < proportionalQuantity) {
          throw new Error(`Insufficient stock for ${ingredient.name}. Required: ${proportionalQuantity.toFixed(2)} ${mealIngredient.unit}, Available: ${stockInBaseUnits} ${ingredient.baseUnit}`);
        }
        
        // Calculate how many packages we need to deduct
        const packagesToDeduct = proportionalQuantity / ingredient.packagingQuantity;
        
        // Deduct stock (in packages)
        ingredient.stock -= packagesToDeduct;
        await ingredient.save();
        
        console.log(`✓ Deducted ${packagesToDeduct.toFixed(2)} ${ingredient.packagingUnit} (${proportionalQuantity.toFixed(2)} ${ingredient.baseUnit}) of ${ingredient.name}. New stock: ${ingredient.stock.toFixed(2)} ${ingredient.packagingUnit}`);
      }
    }
    console.log('Stock deduction completed successfully');
    return true;
  } catch (error) {
    console.error('Error deducting stock for meal plan:', error);
    throw error;
  }
};

// Helper function to restore stock for meal plan
const restoreStockForMealPlan = async (meals) => {
  try {
    for (const mealEntry of meals) {
      const { mealId, servings = 1 } = mealEntry;
      
      // Get meal ingredients
      const mealIngredients = await MealIngredient.find({ mealId }).populate('ingredientId');
      
      for (const mealIngredient of mealIngredients) {
        const ingredient = mealIngredient.ingredientId;
        
        // Calculate proportional stock restoration based on servings
        const meal = await Meal.findById(mealEntry.mealId);
        if (!meal) {
          console.error(`Meal ${mealEntry.mealId} not found during stock restoration`);
          continue;
        }
        
        const mealTotalServings = meal.servings;
        const planServings = servings;
        const proportionalQuantity = (planServings / mealTotalServings) * mealIngredient.quantity;
        
        // Calculate how many packages we need to restore
        const packagesToRestore = proportionalQuantity / ingredient.packagingQuantity;
        
        // Restore stock (in packages)
        ingredient.stock += packagesToRestore;
        await ingredient.save();
        
        console.log(`Restored ${packagesToRestore.toFixed(2)} ${ingredient.packagingUnit} (${proportionalQuantity.toFixed(2)} ${ingredient.baseUnit}) of ${ingredient.name} from meal plan. New stock: ${ingredient.stock.toFixed(2)} ${ingredient.packagingUnit}`);
      }
    }
    return true;
  } catch (error) {
    console.error('Error restoring stock for meal plan:', error);
    throw error;
  }
};

// Create a new meal plan (supports daily and weekly)
const createMealPlan = async (req, res) => {
  try {
    const { date, startDate, endDate, meals, type = "day", createdBy, assignedStaff, notes } = req.body;
    
    // Validation
    if (type === "day") {
      if (!date) return ErrorHandler("'date' is required for daily plans", 400, req, res);
    } else if (type === "week") {
      if (!startDate || !endDate) return ErrorHandler("'startDate' and 'endDate' are required for weekly plans", 400, req, res);
    }
    
    // Check if meals array is provided and not empty
    if (!meals || !Array.isArray(meals) || meals.length === 0) {
      return ErrorHandler("'meals' array is required and cannot be empty", 400, req, res);
    }
    
    // Build meal plan object
    const mealPlanData = { meals, type, createdBy, assignedStaff, notes };
    if (type === "day") mealPlanData.date = date;
    if (type === "week") {
      mealPlanData.startDate = startDate;
      mealPlanData.endDate = endDate;
    }
    
    // Create the meal plan
    const mealPlan = await MealPlan.create(mealPlanData);
    
    // Deduct stock for all meals in the plan
    console.log(`About to deduct stock for meal plan ${mealPlan._id} with meals:`, meals);
    try {
      await deductStockForMealPlan(meals);
      console.log(`✓ Stock deducted successfully for meal plan ${mealPlan._id}`);
    } catch (stockError) {
      console.error(`❌ Stock deduction failed for meal plan ${mealPlan._id}:`, stockError.message);
      // If stock deduction fails, delete the meal plan and return error
      await MealPlan.findByIdAndDelete(mealPlan._id);
      return ErrorHandler(`Failed to create meal plan: ${stockError.message}`, 400, req, res);
    }
    
    return SuccessHandler(mealPlan, 201, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Get meal plans for a specific day or week or range
const getMealPlans = async (req, res) => {
  try {
    const { date, type, startDate, endDate } = req.query;
    let query = {};
    if (type === "day" && date) {
      query.type = "day";
      query.date = new Date(date);
    } else if (type === "week" && startDate && endDate) {
      query.type = "week";
      query.startDate = { $lte: new Date(endDate) };
      query.endDate = { $gte: new Date(startDate) };
    } else if (date) {
      // If only date is provided, find any plan (day or week) that covers this date
      query.$or = [
        { type: "day", date: new Date(date) },
        { type: "week", startDate: { $lte: new Date(date) }, endDate: { $gte: new Date(date) } }
      ];
    } else if (startDate && endDate) {
      // Find all plans overlapping the range
      query.$or = [
        { type: "day", date: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { type: "week", startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ];
    }
    const plans = await MealPlan.find(query).populate("meals.mealId assignedStaff createdBy");
    return SuccessHandler(plans, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Get a single meal plan by ID
const getMealPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const mealPlan = await MealPlan.findById(id)
      .populate("meals.mealId")
      .populate("assignedStaff")
      .populate("createdBy");
    
    if (!mealPlan) {
      return ErrorHandler("Meal plan not found", 404, req, res);
    }
    
    return SuccessHandler(mealPlan, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Get available meals for planning
const getAvailableMeals = async (req, res) => {
  try {
    // Get all active meals
    const meals = await Meal.find({ isActive: true })
      .populate('category')
      .populate('dietaryInfo');
    
    // Get all meal ingredients for these meals
    const mealIngredients = await MealIngredient.find({
      mealId: { $in: meals.map(meal => meal._id) }
    }).populate('ingredientId');
    
    // Group ingredients by meal
    const ingredientsByMeal = {};
    mealIngredients.forEach(mi => {
      if (!ingredientsByMeal[mi.mealId]) {
        ingredientsByMeal[mi.mealId] = [];
      }
      ingredientsByMeal[mi.mealId].push(mi);
    });
    
    // Filter meals that are available for planning and calculate availability
    const availableMeals = meals.filter(meal => {
      const mealIngredients = ingredientsByMeal[meal._id] || [];
      
      // Check if meal has ingredients
      if (mealIngredients.length === 0) {
        return false;
      }
      
      // Check if all ingredients have sufficient stock for at least 1 serving
      const hasSufficientStock = mealIngredients.every(mi => {
        const ingredient = mi.ingredientId;
        if (!ingredient) return false;
        
        // Calculate required quantity in base units
        const requiredQuantity = mi.quantity;
        const availableStock = ingredient.stock * ingredient.packagingQuantity;
        
        // Check if stock is sufficient (at least 1 serving worth)
        return availableStock >= requiredQuantity;
      });
      
      return hasSufficientStock;
    });
    
    // Format the response with improved availability logic
    const formattedMeals = availableMeals.map(meal => {
      const mealIngredients = ingredientsByMeal[meal._id] || [];
      
      // Calculate availability details
      let availableServings = Infinity;
      let totalCost = 0;
      let missingIngredients = [];
      let lowStockIngredients = [];
      
      // Calculate available servings based on most limiting ingredient
      mealIngredients.forEach(mi => {
        const ingredient = mi.ingredientId;
        if (ingredient) {
          const availableStock = ingredient.stock * ingredient.packagingQuantity;
          const requiredPerServing = mi.quantity;
          
          // Calculate how many servings we can make with this ingredient
          const servingsPossible = Math.floor(availableStock / requiredPerServing);
          availableServings = Math.min(availableServings, servingsPossible);
          
          // Calculate cost for this ingredient per serving
          const ingredientCostPerServing = (mi.cost || 0) * (requiredPerServing / ingredient.packagingQuantity);
          totalCost += ingredientCostPerServing;
          
          // Check for low stock (less than 3 servings worth)
          if (servingsPossible < 3) {
            lowStockIngredients.push({
              ingredientId: ingredient._id,
              name: ingredient.name,
              availableServings: servingsPossible,
              currentStock: ingredient.stock,
              packagingUnit: ingredient.packagingUnit,
              packagingQuantity: ingredient.packagingQuantity
            });
          }
        }
      });
      
      // Ensure availableServings is not Infinity and is at least 1
      availableServings = availableServings === Infinity ? 0 : Math.max(1, availableServings);
      
      // Round total cost to 2 decimal places
      totalCost = Math.round(totalCost * 100) / 100;
      
      return {
        _id: meal._id,
        name: meal.title,
        description: meal.description,
        price: meal.price,
        servings: meal.servings,
        images: meal.images,
        isActive: meal.isActive,
        category: meal.category,
        dietaryInfo: meal.dietaryInfo,
        nutritionalInfo: meal.nutritionalInfo,
        ingredients: mealIngredients.map(mi => ({
          ingredientId: mi.ingredientId,
          quantity: mi.quantity,
          unit: mi.unit,
          isOptional: mi.isOptional,
          cost: mi.cost
        })),
        availability: {
          available: availableServings > 0,
          availableServings: availableServings,
          totalCost: totalCost,
          missingIngredients: missingIngredients,
          lowStockIngredients: lowStockIngredients
        },
        isAvailable: availableServings > 0
      };
    });
    
    return SuccessHandler(formattedMeals, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Check if all ingredients are available for a meal plan (supports daily/weekly)
const checkMealPlanStock = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await MealPlan.findById(id).populate("meals.mealId");
    if (!plan) return ErrorHandler("Meal plan not found", 404, req, res);

    // Aggregate required ingredients
    const ingredientNeeds = {};
    for (const mealEntry of plan.meals) {
      const mealIngredients = await MealIngredient.find({ mealId: mealEntry.mealId });
      for (const mi of mealIngredients) {
        const key = mi.ingredientId.toString();
        if (!ingredientNeeds[key]) ingredientNeeds[key] = 0;
        ingredientNeeds[key] += mi.quantity * mealEntry.servings;
      }
    }

    // Determine the relevant date(s) for expiry checks
    let checkStart, checkEnd;
    if (plan.type === "week") {
      checkStart = plan.startDate;
      checkEnd = plan.endDate;
    } else {
      checkStart = checkEnd = plan.date;
    }

    // Check against available batches (by expiry)
    const ingredientStatus = [];
    let allAvailable = true;
    for (const [ingredientId, requiredQty] of Object.entries(ingredientNeeds)) {
      // Only count batches not expired by the end of the plan
      const batches = await IngredientBatch.find({ ingredientId, expiryDate: { $gte: checkEnd } }).sort({ expiryDate: 1 });
      let availableQty = 0;
      for (const batch of batches) {
        availableQty += batch.baseUnitQuantity || batch.quantity;
        if (availableQty >= requiredQty) break;
      }
      ingredientStatus.push({ ingredientId, requiredQty, availableQty, enough: availableQty >= requiredQty });
      if (availableQty < requiredQty) allAvailable = false;
    }

    return SuccessHandler({ allAvailable, ingredientStatus }, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Check if enough staff are available for a meal plan
const checkMealPlanResources = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await MealPlan.findById(id).populate("assignedStaff");
    if (!plan) return ErrorHandler("Meal plan not found", 404, req, res);

    // For demo: just return assigned staff and their roles
    const staffDetails = await User.find({ _id: { $in: plan.assignedStaff } }, "name role");
    // Optionally, check for required roles/skills here

    return SuccessHandler({ assignedStaff: staffDetails }, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Delete a meal plan and restore stock
const deleteMealPlan = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the meal plan before deleting
    const mealPlan = await MealPlan.findById(id);
    if (!mealPlan) {
      return ErrorHandler("Meal plan not found", 404, req, res);
    }
    
    // Restore stock for all meals in the plan
    try {
      await restoreStockForMealPlan(mealPlan.meals);
      console.log(`Stock restored successfully for meal plan ${id}`);
    } catch (stockError) {
      console.error('Failed to restore stock:', stockError.message);
      // Continue with deletion even if stock restoration fails
    }
    
    // Delete the meal plan
    await MealPlan.findByIdAndDelete(id);
    
    return SuccessHandler({ message: "Meal plan deleted successfully" }, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

// Update a meal plan and handle stock changes
const updateMealPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, startDate, endDate, meals, type, assignedStaff, notes } = req.body;
    
    // Find the existing meal plan
    const existingMealPlan = await MealPlan.findById(id);
    if (!existingMealPlan) {
      return ErrorHandler("Meal plan not found", 404, req, res);
    }
    
    // Validation
    if (type === "day") {
      if (!date) return ErrorHandler("'date' is required for daily plans", 400, req, res);
    } else if (type === "week") {
      if (!startDate || !endDate) return ErrorHandler("'startDate' and 'endDate' are required for weekly plans", 400, req, res);
    }
    
    // Check if meals array is provided and not empty
    if (!meals || !Array.isArray(meals) || meals.length === 0) {
      return ErrorHandler("'meals' array is required and cannot be empty", 400, req, res);
    }
    
    // Restore stock for existing meals
    try {
      await restoreStockForMealPlan(existingMealPlan.meals);
      console.log(`Stock restored for existing meals in meal plan ${id}`);
    } catch (stockError) {
      console.error('Failed to restore stock for existing meals:', stockError.message);
      return ErrorHandler(`Failed to update meal plan: ${stockError.message}`, 400, req, res);
    }
    
    // Deduct stock for new meals
    try {
      await deductStockForMealPlan(meals);
      console.log(`Stock deducted for new meals in meal plan ${id}`);
    } catch (stockError) {
      // If stock deduction fails, try to restore the original meals
      try {
        await deductStockForMealPlan(existingMealPlan.meals);
      } catch (restoreError) {
        console.error('Failed to restore original meals after stock deduction failure:', restoreError.message);
      }
      return ErrorHandler(`Failed to update meal plan: ${stockError.message}`, 400, req, res);
    }
    
    // Update the meal plan
    const updateData = { meals, type, assignedStaff, notes };
    if (type === "day") updateData.date = date;
    if (type === "week") {
      updateData.startDate = startDate;
      updateData.endDate = endDate;
    }
    
    const updatedMealPlan = await MealPlan.findByIdAndUpdate(id, updateData, { new: true });
    
    return SuccessHandler(updatedMealPlan, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

module.exports = {
  createMealPlan,
  getMealPlans,
  getMealPlanById,
  getAvailableMeals,
  checkMealPlanStock,
  checkMealPlanResources,
  deleteMealPlan,
  updateMealPlan
}; 