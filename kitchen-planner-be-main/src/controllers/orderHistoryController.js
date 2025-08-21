const OrderHistory = require("../models/User/orderHistory");
const OrderHistoryTracker = require("../utils/orderHistoryTracker");
const { SuccessHandler } = require("../utils/SuccessHandler");
const { ApiError } = require("../utils/ApiError");

/**
 * Get order history for a specific order
 */
const getOrderHistory = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { limit = 50 } = req.query;

    const history = await OrderHistoryTracker.getOrderHistory(orderId, parseInt(limit));

    return SuccessHandler(
      res,
      200,
      "Order history retrieved successfully",
      history
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving order history"));
  }
};

/**
 * Get user's order history
 */
const getUserOrderHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const history = await OrderHistoryTracker.getUserOrderHistory(userId, parseInt(limit));

    return SuccessHandler(
      res,
      200,
      "User order history retrieved successfully",
      history
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving user order history"));
  }
};

/**
 * Get order timeline (chronological order)
 */
const getOrderTimeline = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const timeline = await OrderHistoryTracker.getOrderTimeline(orderId);

    return SuccessHandler(
      res,
      200,
      "Order timeline retrieved successfully",
      timeline
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving order timeline"));
  }
};

/**
 * Get order statistics
 */
const getOrderStatistics = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const statistics = await OrderHistoryTracker.getOrderStatistics(orderId);

    if (!statistics) {
      return next(new ApiError(404, "Order history not found"));
    }

    return SuccessHandler(
      res,
      200,
      "Order statistics retrieved successfully",
      statistics
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving order statistics"));
  }
};

/**
 * Get recent activity across all orders
 */
const getRecentActivity = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;

    const activity = await OrderHistoryTracker.getRecentActivity(parseInt(limit));

    return SuccessHandler(
      res,
      200,
      "Recent activity retrieved successfully",
      activity
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving recent activity"));
  }
};

/**
 * Get recent order history by status
 */
const getRecentHistoryByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const { limit = 50 } = req.query;

    const history = await OrderHistoryTracker.getRecentHistoryByStatus(status, parseInt(limit));

    return SuccessHandler(
      res,
      200,
      `Recent ${status} orders retrieved successfully`,
      history
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving recent history by status"));
  }
};

/**
 * Get order history summary (for dashboard)
 */
const getOrderHistorySummary = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get recent activity
    const recentActivity = await OrderHistoryTracker.getRecentActivity(10);

    // Get status counts for the period
    const statusCounts = await OrderHistory.aggregate([
      {
        $match: {
          changedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily activity for the period
    const dailyActivity = await OrderHistory.aggregate([
      {
        $match: {
          changedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$changedAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const summary = {
      recentActivity,
      statusCounts,
      dailyActivity,
      period: `${days} days`
    };

    return SuccessHandler(
      res,
      200,
      "Order history summary retrieved successfully",
      summary
    );
  } catch (error) {
    next(new ApiError(500, "Error retrieving order history summary"));
  }
};

/**
 * Search order history
 */
const searchOrderHistory = async (req, res, next) => {
  try {
    const { 
      orderNumber, 
      status, 
      userId, 
      changedBy, 
      startDate, 
      endDate,
      limit = 50 
    } = req.query;

    const searchQuery = {};

    if (orderNumber) {
      searchQuery.orderNumber = { $regex: orderNumber, $options: 'i' };
    }

    if (status) {
      searchQuery.status = status;
    }

    if (userId) {
      searchQuery.userId = userId;
    }

    if (changedBy) {
      searchQuery.changedBy = changedBy;
    }

    if (startDate || endDate) {
      searchQuery.changedAt = {};
      if (startDate) {
        searchQuery.changedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        searchQuery.changedAt.$lte = new Date(endDate);
      }
    }

    const history = await OrderHistory.find(searchQuery)
      .populate('changedBy', 'firstName lastName email')
      .populate('userId', 'firstName lastName email')
      .sort({ changedAt: -1 })
      .limit(parseInt(limit));

    return SuccessHandler(
      res,
      200,
      "Order history search completed successfully",
      history
    );
  } catch (error) {
    next(new ApiError(500, "Error searching order history"));
  }
};

module.exports = {
  getOrderHistory,
  getUserOrderHistory,
  getOrderTimeline,
  getOrderStatistics,
  getRecentActivity,
  getRecentHistoryByStatus,
  getOrderHistorySummary,
  searchOrderHistory
}; 