// server/controllers/notificationController.js - Updated
const Notification = require('../models/Notification'); 

exports.getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ user: req.user._id })
      .populate('relatedBooking')
      .populate('relatedOrder')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      isRead: false
    });

    const total = await Notification.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        total,
        hasNext: page * limit < total
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
};

// Helper function to create notifications for different events
exports.createNotification = async (userId, type, title, message, relatedId = null) => {
  try {
    const notificationData = {
      user: userId,
      title,
      message,
      type
    };

    // Set the appropriate related field based on type
    if (type.includes('booking')) {
      notificationData.relatedBooking = relatedId;
    } else if (type.includes('order')) {
      notificationData.relatedOrder = relatedId;
    }

    const notification = new Notification(notificationData);
    await notification.save();
    
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
};