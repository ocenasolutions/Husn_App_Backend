// server/cron/notificationCron.js
const cron = require('node-cron');
const PushNotification = require('../models/PushNotification');
const expoFcmService = require('../services/expoFcmService');

// Check for scheduled notifications every minute
const scheduleNotificationCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      console.log('🔍 Checking for scheduled notifications...');

      const now = new Date();
      
      // Find notifications scheduled for now or past
      const scheduledNotifications = await PushNotification.find({
        status: 'scheduled',
        scheduledFor: { $lte: now }
      });

      if (scheduledNotifications.length === 0) {
        return;
      }

      console.log(`📤 Found ${scheduledNotifications.length} notifications to send`);

      // Send each notification
      for (const notification of scheduledNotifications) {
        try {
          console.log(`Sending notification: ${notification.title}`);
          await expoFcmService.sendToUserGroup(notification._id);
          console.log(`✅ Notification sent: ${notification.title}`);
        } catch (error) {
          console.error(`❌ Failed to send notification ${notification._id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Notification cron error:', error);
    }
  });

  console.log('✅ Notification cron job started');
};

// Clean up old device tokens (run daily at 2 AM)
const cleanupTokensCron = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('🧹 Cleaning up old device tokens...');

      const DeviceToken = require('../models/DeviceToken');
      
      // Remove tokens not used in 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await DeviceToken.deleteMany({
        lastUsed: { $lt: ninetyDaysAgo }
      });

      console.log(`✅ Cleaned up ${result.deletedCount} old tokens`);
    } catch (error) {
      console.error('❌ Token cleanup error:', error);
    }
  });

  console.log('✅ Token cleanup cron job started');
};

// Initialize all cron jobs
const initializeCronJobs = () => {
  scheduleNotificationCron();
  cleanupTokensCron();
  console.log('✅ All notification cron jobs initialized');
};

module.exports = {
  initializeCronJobs,
  scheduleNotificationCron,
  cleanupTokensCron
};