// server/services/stockNotificationService.js
const StockNotification = require('../models/StockNotification');
const Product = require('../models/Product');
const Wishlist = require('../models/Wishlist');

// Note: Install Firebase Admin SDK: npm install firebase-admin
// const admin = require('firebase-admin');

// Initialize Firebase Admin (uncomment and configure when ready)
/*
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
*/

// Send push notification when product is back in stock
const sendStockAvailableNotification = async (productId) => {
  try {
    console.log(`🔔 Checking stock notifications for product: ${productId}`);

    // Get the product details
    const product = await Product.findById(productId);
    if (!product) {
      console.error('Product not found');
      return { success: false, message: 'Product not found' };
    }

    // Check if product is actually in stock
    if (product.stock === 0 || product.stockStatus === 'out-of-stock') {
      console.log('Product is still out of stock, skipping notifications');
      return { success: false, message: 'Product is out of stock' };
    }

    // Get all users who requested notification and have it in wishlist
    const pendingNotifications = await StockNotification.getPendingForProduct(productId);
    
    if (pendingNotifications.length === 0) {
      console.log('No pending notifications found');
      return { success: true, notificationsSent: 0 };
    }

    console.log(`Found ${pendingNotifications.length} users to notify`);

    let successCount = 0;
    let failureCount = 0;

    for (const notification of pendingNotifications) {
      try {
        // Verify product is still in user's wishlist
        const wishlistItem = await Wishlist.findOne({
          user: notification.user._id,
          product: productId
        });

        if (!wishlistItem) {
          console.log(`Product not in wishlist for user ${notification.user._id}, skipping`);
          await StockNotification.cancelNotification(notification.user._id, productId);
          continue;
        }

        // Get FCM token (from notification or user model)
        const fcmToken = notification.fcmToken || notification.user.fcmToken;

        if (!fcmToken) {
          console.log(`No FCM token for user ${notification.user.email}, skipping push notification`);
          failureCount++;
          continue;
        }

        // Prepare notification payload
        const message = {
          notification: {
            title: '🎉 Back in Stock!',
            body: `${product.name} is now available. Order now before it's gone!`,
            imageUrl: product.primaryImage || (product.images?.[0]?.url)
          },
          data: {
            type: 'stock_available',
            productId: productId.toString(),
            productName: product.name,
            productPrice: product.price.toString(),
            productImage: product.primaryImage || (product.images?.[0]?.url) || '',
            timestamp: new Date().toISOString()
          },
          token: fcmToken
        };

        // Send push notification using Firebase Admin SDK
        // Uncomment when Firebase is configured
        /*
        await admin.messaging().send(message);
        console.log(`✅ Push notification sent to ${notification.user.email}`);
        successCount++;
        */

        // For now, just log (remove this when Firebase is active)
        console.log(`📱 Would send notification to ${notification.user.email}:`, message);
        successCount++;

      } catch (error) {
        console.error(`Failed to send notification to user ${notification.user._id}:`, error);
        failureCount++;
      }
    }

    // Mark all notifications as sent
    await StockNotification.markAsNotified(productId);

    console.log(`✅ Stock notification process completed: ${successCount} sent, ${failureCount} failed`);

    return {
      success: true,
      notificationsSent: successCount,
      notificationsFailed: failureCount,
      totalRequests: pendingNotifications.length
    };

  } catch (error) {
    console.error('Error sending stock notifications:', error);
    return {
      success: false,
      message: error.message
    };
  }
};

// Check and send notifications for products that came back in stock
const checkAndNotifyStockChanges = async () => {
  try {
    console.log('🔍 Checking for products that came back in stock...');

    // Find products that:
    // 1. Currently have stock > 0
    // 2. Have pending notification requests
    const productsWithPendingNotifications = await StockNotification.distinct('product', {
      notified: false
    });

    if (productsWithPendingNotifications.length === 0) {
      console.log('No pending stock notifications found');
      return;
    }

    console.log(`Found ${productsWithPendingNotifications.length} products with pending notifications`);

    for (const productId of productsWithPendingNotifications) {
      const product = await Product.findById(productId);
      
      if (product && product.stock > 0 && product.stockStatus !== 'out-of-stock') {
        console.log(`📦 Product "${product.name}" is back in stock, sending notifications...`);
        await sendStockAvailableNotification(productId);
      }
    }

  } catch (error) {
    console.error('Error checking stock changes:', error);
  }
};

module.exports = {
  sendStockAvailableNotification,
  checkAndNotifyStockChanges
};