// server/services/fcmService.js
const admin = require('firebase-admin');
const DeviceToken = require('../models/DeviceToken');
const PushNotification = require('../models/PushNotification');

// Initialize Firebase Admin (call this in server.js)
const initializeFCM = () => {
  try {
    const serviceAccount = require('../config/firebase-service-account.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
  }
};

// Send notification to specific tokens
const sendToTokens = async (tokens, notification, data = {}) => {
  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl
      },
      data: {
        ...data,
        notificationId: notification._id.toString(),
        type: notification.type,
        deepLink: notification.deepLink || ''
      },
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          channelId: 'default',
          sound: 'default',
          priority: notification.priority === 'high' ? 'high' : 'default'
        }
      },
      tokens: tokens
    };

    const response = await admin.messaging().sendMulticast(message);
    
    console.log(`✅ Sent notification: ${response.successCount} success, ${response.failureCount} failed`);
    
    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      
      // Deactivate failed tokens
      await DeviceToken.updateMany(
        { token: { $in: failedTokens } },
        { isActive: false }
      );
    }

    return {
      success: response.successCount,
      failed: response.failureCount
    };
  } catch (error) {
    console.error('FCM send error:', error);
    throw error;
  }
};

// Send notification to user group
const sendToUserGroup = async (notificationId) => {
  try {
    const notification = await PushNotification.findById(notificationId);
    if (!notification) {
      throw new Error('Notification not found');
    }

    let query = { isActive: true };
    
    // Build query based on target audience
    if (notification.targetAudience === 'users') {
      const User = require('../models/User');
      const users = await User.find({ role: 'user' }).select('_id');
      query.user = { $in: users.map(u => u._id) };
    } else if (notification.targetAudience === 'professionals') {
      const Professional = require('../models/Professional');
      const pros = await Professional.find({}).select('_id');
      query.user = { $in: pros.map(p => p._id) };
    } else if (notification.targetAudience === 'specific') {
      query.user = { $in: notification.specificUsers };
    }

    // Get all active device tokens
    const deviceTokens = await DeviceToken.find(query).select('token');
    const tokens = deviceTokens.map(dt => dt.token);

    if (tokens.length === 0) {
      console.log('No tokens found for notification');
      return { success: 0, failed: 0 };
    }

    // FCM allows max 500 tokens per batch
    const batchSize = 500;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const result = await sendToTokens(batch, notification);
      totalSuccess += result.success;
      totalFailed += result.failed;
    }

    // Update notification status
    await PushNotification.findByIdAndUpdate(notificationId, {
      status: 'sent',
      sentAt: new Date(),
      'deliveryStats.sent': totalSuccess + totalFailed,
      'deliveryStats.delivered': totalSuccess,
      'deliveryStats.failed': totalFailed
    });

    return { success: totalSuccess, failed: totalFailed };
  } catch (error) {
    console.error('Send to group error:', error);
    
    await PushNotification.findByIdAndUpdate(notificationId, {
      status: 'failed'
    });
    
    throw error;
  }
};

// Send test notification
const sendTestNotification = async (userId, title, body) => {
  try {
    const tokens = await DeviceToken.find({ 
      user: userId, 
      isActive: true 
    }).select('token');

    if (tokens.length === 0) {
      throw new Error('No active device tokens found');
    }

    const notification = {
      title,
      body,
      type: 'test',
      priority: 'high',
      _id: 'test'
    };

    return await sendToTokens(tokens.map(t => t.token), notification);
  } catch (error) {
    console.error('Test notification error:', error);
    throw error;
  }
};

module.exports = {
  initializeFCM,
  sendToTokens,
  sendToUserGroup,
  sendTestNotification
};