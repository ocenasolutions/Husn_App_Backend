// server/jobs/stockCheckJob.js
const cron = require('node-cron');
const Product = require('../models/Product');
const Notification = require('../models/Notification');

// Function to check all products and create notifications
const checkLowStockProducts = async () => {
  try {
    console.log('🔍 Running stock check job...');
    
    // Find products with low stock or out of stock
    const lowStockProducts = await Product.find({
      isActive: true,
      status: 'published',
      $or: [
        { stock: { $lte: 5, $gt: 0 }, stockStatus: { $ne: 'low-stock' } },
        { stock: 0, stockStatus: { $ne: 'out-of-stock' } }
      ]
    });

    console.log(`Found ${lowStockProducts.length} products with stock issues`);

    for (const product of lowStockProducts) {
      try {
        if (product.stock === 0) {
          // Update stock status and create notification
          product.stockStatus = 'out-of-stock';
          await product.save();
          await Notification.createOutOfStockNotification(product);
          console.log(`✅ Created out-of-stock notification for: ${product.name}`);
        } else if (product.stock <= 5) {
          // Update stock status and create notification
          product.stockStatus = 'low-stock';
          await product.save();
          await Notification.createLowStockNotification(product);
          console.log(`✅ Created low-stock notification for: ${product.name}`);
        }
      } catch (error) {
        console.error(`❌ Error processing product ${product.name}:`, error);
      }
    }

    console.log('✅ Stock check job completed');
  } catch (error) {
    console.error('❌ Stock check job error:', error);
  }
};

// Schedule the job to run every hour
const scheduleStockCheck = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Starting scheduled stock check...');
    checkLowStockProducts();
  });

  console.log('📅 Stock check job scheduled (runs every hour)');

  // Also run immediately on startup
  checkLowStockProducts();
};

module.exports = {
  scheduleStockCheck,
  checkLowStockProducts
};