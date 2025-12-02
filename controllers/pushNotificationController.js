// server/controllers/pushNotificationController.js
const PushNotification = require('../models/PushNotification');
const DeviceToken = require('../models/DeviceToken');
const fcmService = require('../services/fcmService');

// Register device token
exports.registerToken = async (req, res) => {
  try {
    const { token, platform, deviceInfo } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Check if token already exists
    let deviceToken = await DeviceToken.findOne({ token });

    if (deviceToken) {
      // Update existing token
      deviceToken.user = userId;
      deviceToken.platform = platform || 'android';
      deviceToken.deviceInfo = deviceInfo || {};
      deviceToken.isActive = true;
      deviceToken.lastUsed = new Date();
      await deviceToken.save();
    } else {
      // Create new token
      deviceToken = await DeviceToken.create({
        user: userId,
        token,
        platform: platform || 'android',
        deviceInfo: deviceInfo || {}
      });
    }

    res.json({
      success: true,
      message: 'Device token registered successfully',
      data: deviceToken
    });
  } catch (error) {
    console.error('Register token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register device token',
      error: error.message
    });
  }
};

// Unregister device token
exports.unregisterToken = async (req, res) => {
  try {
    const { token } = req.body;

    await DeviceToken.findOneAndUpdate(
      { token },
      { isActive: false }
    );

    res.json({
      success: true,
      message: 'Device token unregistered successfully'
    });
  } catch (error) {
    console.error('Unregister token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unregister device token',
      error: error.message
    });
  }
};

// Create notification (Admin only)
exports.createNotification = async (req, res) => {
  try {
    const {
      title,
      body,
      type,
      targetAudience,
      specificUsers,
      imageUrl,
      deepLink,
      priority,
      scheduledFor,
      data
    } = req.body;

    const notification = await PushNotification.create({
      title,
      body,
      type: type || 'custom',
      targetAudience,
      specificUsers: specificUsers || [],
      imageUrl,
      deepLink,
      priority: priority || 'normal',
      scheduledFor,
      sentBy: req.user._id,
      data: data || {}
    });

    res.json({
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

// Send notification immediately (Admin only)
exports.sendNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await fcmService.sendToUserGroup(notificationId);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        sent: result.success,
        failed: result.failed
      }
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
};

// Send notification and create in one step (Admin only)
exports.sendImmediateNotification = async (req, res) => {
  try {
    const {
      title,
      body,
      type,
      targetAudience,
      specificUsers,
      imageUrl,
      deepLink,
      priority,
      data
    } = req.body;

    // Create notification
    const notification = await PushNotification.create({
      title,
      body,
      type: type || 'custom',
      targetAudience,
      specificUsers: specificUsers || [],
      imageUrl,
      deepLink,
      priority: priority || 'normal',
      sentBy: req.user._id,
      status: 'scheduled',
      data: data || {}
    });

    // Send immediately
    const result = await fcmService.sendToUserGroup(notification._id);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        notification,
        stats: {
          sent: result.success,
          failed: result.failed
        }
      }
    });
  } catch (error) {
    console.error('Send immediate notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
};

// Get all notifications (Admin only)
exports.getAllNotifications = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const notifications = await PushNotification.find(query)
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await PushNotification.countDocuments(query);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

// Get notification by ID (Admin only)
exports.getNotificationById = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await PushNotification.findById(notificationId)
      .populate('sentBy', 'name email')
      .populate('specificUsers', 'name email');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification',
      error: error.message
    });
  }
};

// Delete notification (Admin only)
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await PushNotification.findByIdAndDelete(notificationId);

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

// Get notification statistics (Admin only)
exports.getNotificationStats = async (req, res) => {
  try {
    const totalNotifications = await PushNotification.countDocuments();
    const sentNotifications = await PushNotification.countDocuments({ status: 'sent' });
    const scheduledNotifications = await PushNotification.countDocuments({ status: 'scheduled' });
    const failedNotifications = await PushNotification.countDocuments({ status: 'failed' });

    const totalDevices = await DeviceToken.countDocuments({ isActive: true });

    const deliveryStats = await PushNotification.aggregate([
      {
        $group: {
          _id: null,
          totalSent: { $sum: '$deliveryStats.sent' },
          totalDelivered: { $sum: '$deliveryStats.delivered' },
          totalFailed: { $sum: '$deliveryStats.failed' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        notifications: {
          total: totalNotifications,
          sent: sentNotifications,
          scheduled: scheduledNotifications,
          failed: failedNotifications
        },
        devices: {
          active: totalDevices
        },
        delivery: deliveryStats[0] || {
          totalSent: 0,
          totalDelivered: 0,
          totalFailed: 0
        }
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

// Send test notification (Admin only)
exports.sendTestNotification = async (req, res) => {
  try {
    const { title, body } = req.body;
    const userId = req.user._id;

    const result = await fcmService.sendTestNotification(
      userId,
      title || 'Test Notification',
      body || 'This is a test notification from Husn admin panel'
    );

    res.json({
      success: true,
      message: 'Test notification sent',
      data: result
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
};