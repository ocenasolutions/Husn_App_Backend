// server/scripts/checkProfessionalSetup.js
// Run this with: node server/scripts/checkProfessionalSetup.js

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Professional = require('../models/Professional');
const Order = require('../models/Order');

async function checkProfessionalSetup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    // 1. Check all users with professional role
    console.log('📋 CHECKING USERS WITH PROFESSIONAL ROLE...');
    const professionalUsers = await User.find({ role: 'professional' });
    console.log(`Found ${professionalUsers.length} users with professional role:\n`);
    
    for (const user of professionalUsers) {
      console.log(`  User: ${user.name}`);
      console.log(`    Email: ${user.email}`);
      console.log(`    ID: ${user._id}`);
      console.log(`    Role: ${user.role}\n`);
    }
    // 2. Check all Professional documents
    console.log('📋 CHECKING PROFESSIONAL DOCUMENTS...');
    const professionals = await Professional.find();
    console.log(`Found ${professionals.length} Professional documents:\n`);
    
    for (const prof of professionals) {
      console.log(`  Professional: ${prof.name}`);
      console.log(`    Email: ${prof.email}`);
      console.log(`    ID: ${prof._id}`);
      console.log(`    Active: ${prof.isActive}`);
      console.log(`    Status: ${prof.status}\n`);
      
      // Check if matching user exists
      const matchingUser = await User.findOne({ email: prof.email });
      if (matchingUser) {
        console.log(`    ✅ Matching user found (ID: ${matchingUser._id}, Role: ${matchingUser.role})`);
      } else {
        console.log(`    ❌ NO matching user found with this email`);
      }
      console.log('');
    }
    // 3. Check orders with assigned professionals
    console.log('📋 CHECKING ORDERS WITH ASSIGNED PROFESSIONALS...');
    const ordersWithProfessionals = await Order.find({
      'serviceItems.professionalEmail': { $exists: true, $ne: null }
    }).limit(10);
    console.log(`Found ${ordersWithProfessionals.length} orders with assigned professionals:\n`);
    for (const order of ordersWithProfessionals) {
      console.log(`  Order: ${order.orderNumber}`);
      for (const item of order.serviceItems) {
        if (item.professionalEmail) {
          console.log(`    Professional Email: ${item.professionalEmail}`);
          console.log(`    Professional Name: ${item.professionalName}`);
          // Check if professional document exists
          const prof = await Professional.findOne({ email: item.professionalEmail });
          console.log(`    Professional Doc: ${prof ? 'EXISTS' : 'NOT FOUND'}`);
          // Check if user exists
          const user = await User.findOne({ email: item.professionalEmail });
          console.log(`    User Doc: ${user ? `EXISTS (role: ${user.role})` : 'NOT FOUND'}`);
        }
      }
      console.log('');
    }
    console.log('💡 RECOMMENDATIONS:');
    console.log('-------------------');
    
    if (professionalUsers.length === 0 && professionals.length === 0) {
      console.log('❌ NO PROFESSIONALS FOUND!');
      console.log('   You need to create professional accounts.');
      console.log('   Run: POST /api/auth/register with role: "professional"');
    } else if (professionals.length === 0 && professionalUsers.length > 0) {
      console.log('⚠️  Users with professional role exist, but no Professional documents.');
      console.log('   The middleware will use the user role as fallback.');
      console.log('   This should work, but consider creating Professional documents for full features.');
    } else if (professionals.length > 0 && professionalUsers.length === 0) {
      console.log('⚠️  Professional documents exist, but no users with professional role.');
      console.log('   Create user accounts for these professionals:');
      for (const prof of professionals) {
        const user = await User.findOne({ email: prof.email });
        if (!user) {
          console.log(`   - Create user for: ${prof.email}`);
        }
      }
    } else {
      console.log('✅ Both User and Professional documents exist.');
      console.log('   Make sure emails match between User and Professional documents.');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkProfessionalSetup();