// server/services/expoFcmService.js
const { Expo } = require('expo-server-sdk');
const DeviceToken = require('../models/DeviceToken');
const PushNotification = require('../models/PushNotification');

// Create a new Expo SDK client
const expo = new Expo();

// Helper function to extract project ID from Expo token
const getProjectIdFromToken = (token) => {
  try {
    // Expo tokens contain project info in their structure
    // This is a fallback - we'll group by actual API response
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
};

// Send notification to specific tokens (with project grouping)
const sendToTokens = async (tokens, notification, data = {}) => {
  try {
    // Filter valid Expo push tokens
    const validTokens = tokens.filter(token => Expo.isExpoPushToken(token));
    
    if (validTokens.length === 0) {
      console.log('No valid Expo push tokens');
      return { success: 0, failed: tokens.length };
    }

    // Create messages
    const messages = validTokens.map(token => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: {
        ...data,
        notificationId: notification._id?.toString() || 'test',
        type: notification.type,
        deepLink: notification.deepLink || '',
        screen: notification.screen || '',
        params: notification.params || {}
      },
      priority: notification.priority === 'high' ? 'high' : 'default',
      badge: 1,
      ...(notification.imageUrl && { image: notification.imageUrl })
    }));

    // Send notifications in chunks
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    const projectGroups = {};

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        // If error is about multiple projects, split and retry
        if (error.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS' && error.details) {
          console.log('⚠️ Multiple projects detected, splitting notifications...');
          
          // Group tokens by project from error details
          const projectTokens = {};
          for (const [projectId, tokenList] of Object.entries(error.details)) {
            projectTokens[projectId] = tokenList;
          }

          // Send to each project separately
          for (const [projectId, tokenList] of Object.entries(projectTokens)) {
            try {
              console.log(`📤 Sending to project: ${projectId} (${tokenList.length} tokens)`);
              
              const projectMessages = chunk.filter(msg => tokenList.includes(msg.to));
              const projectTickets = await expo.sendPushNotificationsAsync(projectMessages);
              tickets.push(...projectTickets);
              
              console.log(`✅ Sent to ${projectId}: ${projectTickets.length} notifications`);
            } catch (projectError) {
              console.error(`❌ Error sending to project ${projectId}:`, projectError.message);
              // Add failure tickets for this project
              tokenList.forEach(() => {
                tickets.push({ 
                  status: 'error', 
                  message: projectError.message 
                });
              });
            }
          }
        } else {
          console.error('❌ Error sending chunk:', error.message);
          // Add failure tickets for entire chunk
          chunk.forEach(() => {
            tickets.push({ 
              status: 'error', 
              message: error.message 
            });
          });
        }
      }
    }

    // Count successes and failures
    let successCount = 0;
    let failureCount = 0;
    const failedTokens = [];

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        successCount++;
      } else {
        failureCount++;
        if (validTokens[index] && (
          ticket.details?.error === 'DeviceNotRegistered' ||
          ticket.message?.includes('DeviceNotRegistered')
        )) {
          failedTokens.push(validTokens[index]);
        }
      }
    });

    // Deactivate failed tokens
    if (failedTokens.length > 0) {
      await DeviceToken.updateMany(
        { token: { $in: failedTokens } },
        { isActive: false }
      );
      console.log(`🔕 Deactivated ${failedTokens.length} invalid tokens`);
    }

    console.log(`✅ Notification delivery: ${successCount} success, ${failureCount} failed`);
    
    return {
      success: successCount,
      failed: failureCount
    };
  } catch (error) {
    console.error('❌ Expo send error:', error);
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
      const pros = await Professional.find({}).select('user');
      query.user = { $in: pros.map(p => p.user) };
    } else if (notification.targetAudience === 'specific') {
      query.user = { $in: notification.specificUsers };
    }

    // Get all active device tokens
    const deviceTokens = await DeviceToken.find(query).select('token');
    const tokens = deviceTokens.map(dt => dt.token);

    if (tokens.length === 0) {
      console.log('⚠️ No tokens found for notification');
      await PushNotification.findByIdAndUpdate(notificationId, {
        status: 'sent',
        sentAt: new Date(),
        'deliveryStats.sent': 0,
        'deliveryStats.delivered': 0,
        'deliveryStats.failed': 0
      });
      return { success: 0, failed: 0 };
    }

    console.log(`📤 Sending to ${tokens.length} devices`);

    // Send notifications
    const result = await sendToTokens(tokens, notification);

    // Update notification status
    await PushNotification.findByIdAndUpdate(notificationId, {
      status: 'sent',
      sentAt: new Date(),
      'deliveryStats.sent': result.success + result.failed,
      'deliveryStats.delivered': result.success,
      'deliveryStats.failed': result.failed
    });

    return result;
  } catch (error) {
    console.error('❌ Send to group error:', error);
    
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
    console.error('❌ Test notification error:', error);
    throw error;
  }
};

module.exports = {
  sendToTokens,
  sendToUserGroup,
  sendTestNotification
};