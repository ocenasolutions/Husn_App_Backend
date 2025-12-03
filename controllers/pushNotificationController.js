// server/controllers/pushNotificationController.js
const PushNotification = require('../models/PushNotification');
const DeviceToken = require('../models/DeviceToken');
const expoFcmService = require('../services/expoFcmService');

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

    console.log(`📝 Registering token for user: ${userId}`);

    // Check if token already exists
    let deviceToken = await DeviceToken.findOne({ token });

    if (deviceToken) {
      // Update existing token
      console.log(`🔄 Updating existing token`);
      deviceToken.user = userId;
      deviceToken.platform = platform || 'android';
      deviceToken.deviceInfo = deviceInfo || {};
      deviceToken.isActive = true;
      deviceToken.lastUsed = new Date();
      await deviceToken.save();
    } else {
      // Create new token
      console.log(`✨ Creating new token`);
      deviceToken = await DeviceToken.create({
        user: userId,
        token,
        platform: platform || 'android',
        deviceInfo: deviceInfo || {}
      });
    }

    console.log(`✅ Token registered successfully`);

    res.json({
      success: true,
      message: 'Device token registered successfully',
      data: deviceToken
    });
  } catch (error) {
    console.error('❌ Register token error:', error);
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

    console.log(`🔕 Token unregistered: ${token}`);

    res.json({
      success: true,
      message: 'Device token unregistered successfully'
    });
  } catch (error) {
    console.error('❌ Unregister token error:', error);
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

    console.log(`📋 Creating notification: ${title}`);

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

    console.log(`✅ Notification created: ${notification._id}`);

    res.json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });
  } catch (error) {
    console.error('❌ Create notification error:', error);
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

    console.log(`📤 Sending notification: ${notificationId}`);

    const result = await expoFcmService.sendToUserGroup(notificationId);

    console.log(`✅ Notification sent - Success: ${result.success}, Failed: ${result.failed}`);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        sent: result.success,
        failed: result.failed
      }
    });
  } catch (error) {
    console.error('❌ Send notification error:', error);
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

    console.log(`🚀 Sending immediate notification: ${title}`);

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
    const result = await expoFcmService.sendToUserGroup(notification._id);

    console.log(`✅ Immediate notification sent - Success: ${result.success}, Failed: ${result.failed}`);

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
    console.error('❌ Send immediate notification error:', error);
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

    console.log(`📊 Retrieved ${notifications.length} notifications`);

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
    console.error('❌ Get notifications error:', error);
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
    console.error('❌ Get notification error:', error);
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

    console.log(`🗑️ Notification deleted: ${notificationId}`);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete notification error:', error);
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

    console.log(`📊 Stats retrieved - Total notifications: ${totalNotifications}, Active devices: ${totalDevices}`);

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
    console.error('❌ Get stats error:', error);
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

    console.log(`🧪 Sending test notification to user: ${userId}`);

    const result = await expoFcmService.sendTestNotification(
      userId,
      title || 'Test Notification',
      body || 'This is a test notification from Husn admin panel'
    );

    console.log(`✅ Test notification sent - Success: ${result.success}, Failed: ${result.failed}`);

    res.json({
      success: true,
      message: 'Test notification sent',
      data: result
    });
  } catch (error) {
    console.error('❌ Send test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
};