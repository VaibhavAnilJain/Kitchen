const Meal = require('../models/Meals/meals');
const { analyzeNutrition } = require('../utils/nutritionApi');

// Create a new meal
exports.createMeal = async (req, res) => {
  try {
    const {
      title,
      description,
      servings,
      price,
      stock,
      discount,
      category,
      tags,
      images,
      ingredients
    } = req.body;

    // Analyze nutrition using Edamam API
    const nutritionData = await analyzeNutrition(ingredients);

    // Create new meal with nutrition data
    const meal = new Meal({
      title,
      description,
      servings,
      price,
      stock,
      discount,
      category,
      tags,
      images,
      ingredients,
      nutritionalInfo: nutritionData.nutritionalInfo,
      nutriScore: nutritionData.nutriScore,
      allergens: nutritionData.allergens,
      dietaryInfo: {
        vegetarian: nutritionData.healthLabels.includes('vegetarian'),
        vegan: nutritionData.healthLabels.includes('vegan'),
        glutenFree: nutritionData.healthLabels.includes('gluten-free'),
        lactoseFree: nutritionData.healthLabels.includes('lactose-free')
      }
    });

    await meal.save();
    res.status(201).json({
      success: true,
      data: meal
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get all meals with optional nutrition filters
exports.getMeals = async (req, res) => {
  try {
    const {
      nutriScore,
      minProtein,
      maxCalories,
      dietaryRestrictions,
      allergens
    } = req.query;

    let query = {};

    // Add nutrition filters if provided
    if (nutriScore) {
      query['nutriScore'] = nutriScore;
    }

    if (minProtein) {
      query['nutritionalInfo.protein.value'] = { $gte: Number(minProtein) };
    }

    if (maxCalories) {
      query['nutritionalInfo.energy.value'] = { $lte: Number(maxCalories) };
    }

    if (dietaryRestrictions) {
      const restrictions = dietaryRestrictions.split(',');
      restrictions.forEach(restriction => {
        query[`dietaryInfo.${restriction}`] = true;
      });
    }

    if (allergens) {
      const allergenList = allergens.split(',');
      query['allergens'] = { $nin: allergenList };
    }

    const meals = await Meal.find(query).populate('category');
    
    res.status(200).json({
      success: true,
      count: meals.length,
      data: meals
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get meal by ID
exports.getMealById = async (req, res) => {
  try {
    const meal = await Meal.findById(req.params.id).populate('category');
    
    if (!meal) {
      return res.status(404).json({
        success: false,
        error: 'Meal not found'
      });
    }

    res.status(200).json({
      success: true,
      data: meal
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Update meal
exports.updateMeal = async (req, res) => {
  try {
    const {
      ingredients,
      ...updateData
    } = req.body;

    let meal = await Meal.findById(req.params.id);

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: 'Meal not found'
      });
    }

    // If ingredients are updated, recalculate nutrition
    if (ingredients) {
      const nutritionData = await analyzeNutrition(ingredients);
      updateData.nutritionalInfo = nutritionData.nutritionalInfo;
      updateData.nutriScore = nutritionData.nutriScore;
      updateData.allergens = nutritionData.allergens;
      updateData.dietaryInfo = {
        vegetarian: nutritionData.healthLabels.includes('vegetarian'),
        vegan: nutritionData.healthLabels.includes('vegan'),
        glutenFree: nutritionData.healthLabels.includes('gluten-free'),
        lactoseFree: nutritionData.healthLabels.includes('lactose-free')
      };
    }

    meal = await Meal.findByIdAndUpdate(
      req.params.id,
      { ...updateData, ingredients },
      { new: true, runValidators: true }
    ).populate('category');

    res.status(200).json({
      success: true,
      data: meal
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Delete meal
exports.deleteMeal = async (req, res) => {
  try {
    const meal = await Meal.findByIdAndDelete(req.params.id);

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: 'Meal not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}; 