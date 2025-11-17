// server/scripts/migrate-to-email.js
// Migration script to convert professionalId to professionalEmail

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Professional = require('../models/Professional');
require('dotenv').config();

async function migrateToEmail() {
  try {
    console.log('🔄 Starting migration from professionalId to professionalEmail...');
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');
    const orders = await Order.find({
      'serviceItems.professionalId': { $exists: true, $ne: null }
    });
    console.log(`📋 Found ${orders.length} orders to migrate`);
    let migratedCount = 0;
    let errorCount = 0;
    for (const order of orders) {
      try {
        let orderModified = false;
        for (const serviceItem of order.serviceItems) {
          if (serviceItem.professionalId && !serviceItem.professionalEmail) {
            const professional = await Professional.findById(serviceItem.professionalId);
            if (professional) {
              serviceItem.professionalEmail = professional.email.toLowerCase();
              
              if (!serviceItem.professionalName) {
                serviceItem.professionalName = professional.name;
              }
              if (!serviceItem.professionalPhone && professional.phone) {
                serviceItem.professionalPhone = professional.phone;
              }
              serviceItem.professionalId = undefined;
              orderModified = true;
              console.log(`✅ Migrated service item in order ${order.orderNumber}: ${professional.name} (${professional.email})`);
            } else {
              console.warn(`⚠️ Professional not found for ID: ${serviceItem.professionalId} in order ${order.orderNumber}`);
              errorCount++;
            }
          }
        }
        if (orderModified) {
          await order.save();
          migratedCount++;
        }
      } catch (error) {
        console.error(`❌ Error migrating order ${order.orderNumber}:`, error.message);
        errorCount++;
      }
    }
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} orders`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('🎉 Migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
}
migrateToEmail();