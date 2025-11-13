// server/scripts/seedProfessionalsWithEmail.js
// Seed script to create professionals WITH EMAIL ADDRESSES

const mongoose = require('mongoose');
const Professional = require('../models/Professional');
require('dotenv').config();

const sampleProfessionals = [
  {
    name: 'Pooja Malhotra',
    email: 'pooja.malhotra@beautysalon.com',
    phone: '+91-9876543210',
    role: 'Senior Hair Stylist',
    specializations: ['Hair', 'Styling'],
    experience: 8,
    bio: 'Expert in hair coloring, styling, and bridal makeovers',
    rating: 4.8,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Rahul Sharma',
    email: 'rahul.sharma@beautysalon.com',
    phone: '+91-9876543211',
    role: 'Makeup Artist',
    specializations: ['Makeup', 'Bridal'],
    experience: 6,
    bio: 'Specialized in bridal makeup and party looks',
    rating: 4.9,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Priya Patel',
    email: 'priya.patel@beautysalon.com',
    phone: '+91-9876543212',
    role: 'Skincare Specialist',
    specializations: ['Skincare', 'Facial'],
    experience: 5,
    bio: 'Expert in facial treatments and skincare routines',
    rating: 4.7,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Amit Kumar',
    email: 'amit.kumar@beautysalon.com',
    phone: '+91-9876543213',
    role: 'Nail Technician',
    specializations: ['Nails', 'Manicure'],
    experience: 4,
    bio: 'Specialized in nail art and gel extensions',
    rating: 4.6,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Sneha Reddy',
    email: 'sneha.reddy@beautysalon.com',
    phone: '+91-9876543214',
    role: 'Spa Therapist',
    specializations: ['Spa', 'Massage'],
    experience: 7,
    bio: 'Expert in therapeutic massages and spa treatments',
    rating: 4.9,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Vikram Singh',
    email: 'vikram.singh@beautysalon.com',
    phone: '+91-9876543215',
    role: 'Hair Colorist',
    specializations: ['Hair', 'Coloring'],
    experience: 10,
    bio: 'Specialist in hair coloring techniques and balayage',
    rating: 5.0,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Anjali Verma',
    email: 'anjali.verma@beautysalon.com',
    phone: '+91-9876543216',
    role: 'Bridal Specialist',
    specializations: ['Bridal', 'Makeup', 'Hair'],
    experience: 9,
    bio: 'Complete bridal makeover expert',
    rating: 4.8,
    isActive: true,
    status: 'active'
  },
  {
    name: 'Rajesh Gupta',
    email: 'rajesh.gupta@beautysalon.com',
    phone: '+91-9876543217',
    role: 'Waxing Specialist',
    specializations: ['Waxing', 'Hair Removal'],
    experience: 3,
    bio: 'Expert in various waxing techniques',
    rating: 4.5,
    isActive: true,
    status: 'active'
  }
];

async function seedProfessionalsWithEmail() {
  try {
    console.log('🌱 Starting to seed professionals with emails...');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    let addedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    for (const proData of sampleProfessionals) {
      // Check if professional already exists by email
      const existingPro = await Professional.findOne({ 
        email: proData.email 
      });

      if (existingPro) {
        console.log(`⏭️  Skipped: ${proData.name} (${proData.email}) - already exists`);
        skippedCount++;
        
        // Update if missing critical fields
        let needsUpdate = false;
        if (!existingPro.email) {
          existingPro.email = proData.email;
          needsUpdate = true;
        }
        if (!existingPro.isActive) {
          existingPro.isActive = true;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          await existingPro.save();
          console.log(`   ↳ Updated: ${proData.name}`);
          updatedCount++;
        }
      } else {
        // Create new professional
        const professional = new Professional(proData);
        await professional.save();
        console.log(`✅ Added: ${proData.name} (${proData.email})`);
        addedCount++;
      }
    }

    console.log('\n📊 Seeding Summary:');
    console.log(`✅ Added: ${addedCount} professionals`);
    console.log(`🔄 Updated: ${updatedCount} professionals`);
    console.log(`⏭️  Skipped: ${skippedCount} professionals (already exist)`);

    // Verify all have emails
    const totalPros = await Professional.countDocuments();
    const prosWithEmail = await Professional.countDocuments({ 
      email: { $exists: true, $ne: null, $ne: '' } 
    });
    const prosWithoutEmail = totalPros - prosWithEmail;

    console.log('\n🔍 Email Verification:');
    console.log(`Total professionals: ${totalPros}`);
    console.log(`With email: ${prosWithEmail}`);
    console.log(`Without email: ${prosWithoutEmail}`);

    if (prosWithoutEmail > 0) {
      console.warn('\n⚠️  WARNING: Some professionals are missing emails!');
      const missing = await Professional.find({
        $or: [
          { email: { $exists: false } },
          { email: null },
          { email: '' }
        ]
      }).select('name _id');
      
      console.warn('Missing emails for:', missing.map(p => p.name).join(', '));
    }

    console.log('\n🎉 Seeding completed!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
}

// Run seeding
seedProfessionalsWithEmail();

// To run this script:
// node scripts/seedProfessionalsWithEmail.js