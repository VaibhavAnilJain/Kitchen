const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const mealSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    servings: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    images: {
      type: [String],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // References to normalized tables
    nutritionalInfo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NutritionalInfo"
    },
    dietaryInfo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DietaryInfo"
    }
  },
  {
    timestamps: true,
  }
);

const Meal = mongoose.model("Meal", mealSchema);
module.exports = Meal;
