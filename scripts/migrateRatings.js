// server/scripts/migrateRatings.js
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Product = require('../models/Product');
const Service = require('../models/Service');
const Review = require('../models/Review');

async function migrateRatings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ===== UPDATE PRODUCTS =====
    console.log('\n📦 Processing Products...');
    const products = await Product.find({});
    let productCount = 0;

    for (const product of products) {
      // Get all approved reviews for this product
      const reviews = await Review.find({
        productId: product._id,
        status: 'approved'
      });

      if (reviews.length > 0) {
        // Calculate average rating
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / reviews.length;
        
        // Update product with rating data
        product.rating = Math.round(averageRating * 10) / 10; // Round to 1 decimal
        product.reviewCount = reviews.length;
        
        await product.save();
        
        console.log(`✓ ${product.name}: ${product.rating} ⭐ (${product.reviewCount} reviews)`);
        productCount++;
      } else {
        // No reviews - set to 0
        product.rating = 0;
        product.reviewCount = 0;
        await product.save();
      }
    }

    console.log(`\n✅ Updated ${productCount} products with ratings`);

    // ===== UPDATE SERVICES =====
    console.log('\n🛎️  Processing Services...');
    const services = await Service.find({});
    let serviceCount = 0;

    for (const service of services) {
      // Get all approved reviews for this service
      const reviews = await Review.find({
        serviceId: service._id,
        status: 'approved'
      });

      if (reviews.length > 0) {
        // Calculate average rating
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / reviews.length;
        
        // Update service with rating data
        service.rating = Math.round(averageRating * 10) / 10; // Round to 1 decimal
        service.reviewCount = reviews.length;
        
        await service.save();
        
        console.log(`✓ ${service.name}: ${service.rating} ⭐ (${service.reviewCount} reviews)`);
        serviceCount++;
      } else {
        // No reviews - set to 0
        service.rating = 0;
        service.reviewCount = 0;
        await service.save();
      }
    }

    console.log(`\n✅ Updated ${serviceCount} services with ratings`);

    // ===== SUMMARY =====
    console.log('\n📊 Migration Summary:');
    console.log(`   Products processed: ${products.length}`);
    console.log(`   Products with ratings: ${productCount}`);
    console.log(`   Services processed: ${services.length}`);
    console.log(`   Services with ratings: ${serviceCount}`);
    
    console.log('\n✨ Rating migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration
migrateRatings();