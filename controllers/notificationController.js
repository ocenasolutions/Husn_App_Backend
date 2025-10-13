// server/controllers/notificationController.js
const Notification = require('../models/Notification');

// Get all admin notifications
exports.getAdminNotifications = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      type, 
      read, 
      priority 
    } = req.query;
    
    const skip = (page - 1) * limit;
    const filter = { recipient: 'admin' };
    
    // Apply filters
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (read !== undefined) {
      filter.read = read === 'true';
    }
    
    if (priority) {
      filter.priority = priority;
    }
    
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('relatedId')
      .lean();
    
    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ 
      recipient: 'admin', 
      read: false 
    });
    
    res.json({
      success: true,
      data: notifications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        unreadCount
      }
    });
    
  } catch (error) {
    console.error('Get admin notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      recipient: 'admin', 
      read: false 
    });
    
    res.json({
      success: true,
      data: { unreadCount: count }
    });
    
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findById(id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    await notification.markAsRead();
    
    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
    
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: 'admin', read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
    
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all as read',
      error: error.message
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findByIdAndDelete(id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
};

// Delete all read notifications
exports.deleteAllRead = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ 
      recipient: 'admin', 
      read: true 
    });
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} read notifications`
    });
    
  } catch (error) {
    console.error('Delete all read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete read notifications',
      error: error.message
    });
  }
};

// Get notification statistics
exports.getNotificationStats = async (req, res) => {
  try {
    const stats = await Notification.aggregate([
      { $match: { recipient: 'admin' } },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
          }
        }
      }
    ]);
    
    const totalUnread = await Notification.countDocuments({ 
      recipient: 'admin', 
      read: false 
    });
    
    const urgentCount = await Notification.countDocuments({ 
      recipient: 'admin', 
      priority: 'urgent',
      read: false 
    });
    
    res.json({
      success: true,
      data: {
        byType: stats,
        totalUnread,
        urgentCount
      }
    });
    
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics',
      error: error.message
    });
  }
};

// Create manual notification (Admin to send custom notifications)
exports.createNotification = async (req, res) => {
  try {
    const { type, title, message, priority, relatedId, relatedModel } = req.body;
    
    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Type, title, and message are required'
      });
    }
    
    const notification = new Notification({
      type,
      title,
      message,
      priority: priority || 'medium',
      recipient: 'admin',
      relatedId,
      relatedModel
    });
    
    await notification.save();
    
    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });
    
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    });
  }
};