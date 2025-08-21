const SuccessHandler = require("../utils/SuccessHandler");
const ErrorHandler = require("../utils/ErrorHandler");
const sendNotification = require("../utils/sendNotification");
const Meal = require("../models/Meals/meals");
const Order = require("../models/User/order");
const User = require("../models/User/user");
const Customer = require("../models/User/customer");
const Payment = require("../models/User/payment");
const OrderHistoryTracker = require("../utils/orderHistoryTracker");
// const Order = require("../models/Orders/order");

const getAllOrders = async (req, res) => {
  // #swagger.tags = ['orders']
  try {
    const searchFilter = req.query.search
      ? {
          $or: [
            { "user.firstName": { $regex: req.query.search, $options: "i" } },
            { "user.lastName": { $regex: req.query.search, $options: "i" } },
            { "user.email": { $regex: req.query.search, $options: "i" } },
            { orderId: { $regex: req.query.search, $options: "i" } },
          ],
        }
      : {};

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const roleFilter = req.user.role === "user" ? { user: req.user._id } :{};

    const orders = await Order.find({
      ...searchFilter,
      ...roleFilter,
    })
      .populate("user")
      .populate("customer", "customerId billingInfo")
      .populate("payment", "paymentId amount status type method")
      .skip(skip)
      .limit(limit);
    return SuccessHandler(orders, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};
const getOrder = async (req, res) => {
  // #swagger.tags = ['orders']
  try {
    const order = await Order.findById(req.params.id)
      .populate("user")
      .populate("customer", "customerId billingInfo preferences")
      .populate("payment", "paymentId amount status type method paymentDetails");
    if (!order) {
      return ErrorHandler("Order not found", 404, req, res);
    }
    return SuccessHandler(order, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};
const checkout = async (req, res) => {
  // #swagger.tags = ['orders']
  try {
    const { arrayOfMeals } = req.body;
    Promise.all(
      arrayOfMeals.map(async (meal) => {
        const mealDetails = await Meal.findById(meal._id).populate("category");
        if (!mealDetails) {
          // return ErrorHandler("Meal not found", 404, req, res);
          throw new Error("Meal not found");
        }
        let data = { ...mealDetails.toObject(), qty: meal.qty };
        data.totalPrice = data.price * data.qty;
        data.discountedPrice =
          data.discount > 0
            ? data.price - (data.price * data.discount) / 100
            : data.price;
        return data;
      })
    )
      .then((result) => {
        console.log(result);
        return SuccessHandler(
          {
            meals: result,
            total: result.reduce((acc, curr) => acc + curr.totalPrice, 0),
            subTotal: result.reduce(
              (acc, curr) => acc + curr.discountedPrice * curr.qty,
              0
            ),
          },
          200,
          res
        );
      })
      .catch((error) => {
        return ErrorHandler(error.message, 500, req, res);
      });
  } catch (error) {
    console.log(error);
    return ErrorHandler(error.message, 500, req, res);
  }
};
const createOrder = async (req, res) => {
  // #swagger.tags = ['orders']
  try {
    const { 
      meals, 
      total, 
      subTotal, 
      tax = 0,
      deliveryFee = 0,
      discount = 0,
      billingInfo, 
      deliveryAddress,
      specialInstructions 
    } = req.body;

    // Get or create customer for the user
    let customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      // Create customer if doesn't exist
      customer = new Customer({
        user: req.user._id,
        billingInfo: {
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          phone: billingInfo?.phone || "",
          address: billingInfo?.address || {
            street: "",
            city: "",
            state: "",
            zipCode: "",
            country: "United States"
          }
        }
      });
      await customer.save();
    }

    const order = new Order({
      meals,
      total,
      subTotal,
      tax,
      deliveryFee,
      discount,
      user: req.user._id,
      customer: customer._id,
      billingInfo,
      deliveryAddress,
      specialInstructions,
    });
    await order.save();

    // Create initial order history entry
    await OrderHistoryTracker.createInitialEntry(order, req.user._id);

    // Update customer order statistics
    await customer.updateOrderStats(total);

    SuccessHandler(order, 201, res);

    const admins = await User.find({ role: "admin" });
    Promise.all(
      admins.map(async (admin) => {
        await sendNotification(
          admin._id,
          "New Order",
          `You have a new order from ${req.user.firstName} ${req.user.lastName}`,
          "newOrder",
          {
            orderId: order._id,
          }
        );
      })
    );
    Promise.all(
      meals.map(async (meal) => {
        const mealDetails = await Meal.findById(meal._id);
        mealDetails.stock -= meal.qty;
        await mealDetails.save();
      })
    );
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};
const updateOrderStatus = async (req, res) => {
  // #swagger.tags = ['orders']
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return ErrorHandler("Order not found", 404, req, res);
    }
    
    const previousStatus = order.status;
    order.status = req.body.status;
    await order.save();

    // Create order history entry for status change
    await OrderHistoryTracker.updateOrderStatus(
      order, 
      req.body.status, 
      req.user._id, 
      req.body.notes || `Status changed from ${previousStatus} to ${req.body.status}`
    );

    return SuccessHandler(order, 200, res);
  } catch (error) {
    return ErrorHandler(error.message, 500, req, res);
  }
};

module.exports = {
  getAllOrders,
  getOrder,
  checkout,
  createOrder,
  updateOrderStatus,
};
