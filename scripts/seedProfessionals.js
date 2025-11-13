// server/scripts/seedProfessionals.js
// Run this file once to add test professionals to your database
// Command: node server/scripts/seedProfessionals.js

require('dotenv').config();
const mongoose = require('mongoose');
const Professional = require('../models/Professional');

const professionals = [
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@beauty.com',
    phone: '+91 98765 43210',
    role: 'Senior Hair Stylist',
    specializations: ['Hair Care', 'Hair Styling', 'Hair Color'],
    experience: 8,
    bio: 'Expert in modern hair styling and coloring techniques with 8 years of experience.',
    rating: 4.8,
    reviewCount: 156,
    totalBookings: 320,
    completedBookings: 312,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '09:00',
      end: '19:00'
    }
  },
  {
    name: 'Anjali Verma',
    email: 'anjali.verma@beauty.com',
    phone: '+91 98765 43211',
    role: 'Makeup Artist',
    specializations: ['Makeup', 'Bridal Makeup', 'Party Makeup'],
    experience: 6,
    bio: 'Certified makeup artist specializing in bridal and party makeup.',
    rating: 4.9,
    reviewCount: 203,
    totalBookings: 280,
    completedBookings: 275,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '10:00',
      end: '20:00'
    }
  },
  {
    name: 'Sneha Patel',
    email: 'sneha.patel@beauty.com',
    phone: '+91 98765 43212',
    role: 'Nail Technician',
    specializations: ['Nails', 'Nail Art', 'Manicure', 'Pedicure'],
    experience: 5,
    bio: 'Professional nail artist with expertise in nail extensions and intricate designs.',
    rating: 4.7,
    reviewCount: 142,
    totalBookings: 245,
    completedBookings: 240,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '09:30',
      end: '18:30'
    }
  },
  {
    name: 'Kavita Singh',
    email: 'kavita.singh@beauty.com',
    phone: '+91 98765 43213',
    role: 'Skincare Specialist',
    specializations: ['Facials', 'Skin Care', 'Skin Treatment'],
    experience: 10,
    bio: 'Certified esthetician with 10 years experience in advanced skincare treatments.',
    rating: 4.9,
    reviewCount: 187,
    totalBookings: 298,
    completedBookings: 295,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '08:00',
      end: '17:00'
    }
  },
  {
    name: 'Meera Reddy',
    email: 'meera.reddy@beauty.com',
    phone: '+91 98765 43214',
    role: 'Spa Therapist',
    specializations: ['Spa', 'Massage', 'Body Treatment'],
    experience: 7,
    bio: 'Experienced spa therapist specializing in relaxation and therapeutic massages.',
    rating: 4.8,
    reviewCount: 165,
    totalBookings: 256,
    completedBookings: 252,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '10:00',
      end: '19:00'
    }
  },
  {
    name: 'Ritu Kapoor',
    email: 'ritu.kapoor@beauty.com',
    phone: '+91 98765 43215',
    role: 'Waxing Specialist',
    specializations: ['Waxing', 'Threading', 'Hair Removal'],
    experience: 4,
    bio: 'Gentle and efficient waxing specialist with focus on client comfort.',
    rating: 4.6,
    reviewCount: 128,
    totalBookings: 198,
    completedBookings: 195,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '09:00',
      end: '18:00'
    }
  },
  {
    name: 'Neha Gupta',
    email: 'neha.gupta@beauty.com',
    phone: '+91 98765 43216',
    role: 'Beauty Consultant',
    specializations: ['Makeup', 'Hair Care', 'Skin Care'],
    experience: 9,
    bio: 'Versatile beauty professional offering comprehensive beauty services.',
    rating: 4.7,
    reviewCount: 174,
    totalBookings: 302,
    completedBookings: 298,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '08:30',
      end: '19:30'
    }
  },
  {
    name: 'Pooja Malhotra',
    email: 'pooja.malhotra@beauty.com',
    phone: '+91 98765 43217',
    role: 'Bridal Specialist',
    specializations: ['Bridal Makeup', 'Hair Styling', 'Mehndi'],
    experience: 12,
    bio: 'Leading bridal makeup artist and stylist with 12 years of experience.',
    rating: 5.0,
    reviewCount: 245,
    totalBookings: 350,
    completedBookings: 348,
    isActive: true,
    status: 'active',
    workingHours: {
      start: '07:00',
      end: '22:00'
    }
  }
];

async function seedProfessionals() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing professionals (optional - comment out if you want to keep existing)
    console.log('🗑️  Clearing existing professionals...');
    await Professional.deleteMany({});
    console.log('✅ Cleared existing professionals');

    // Insert new professionals
    console.log('📝 Inserting professionals...');
    const result = await Professional.insertMany(professionals);
    console.log(`✅ Successfully inserted ${result.length} professionals`);

    // Display summary
    console.log('\n📊 Professionals Summary:');
    result.forEach(prof => {
      console.log(`   • ${prof.name} (${prof.role}) - ${prof.specializations.join(', ')}`);
    });

    console.log('\n✨ Seeding completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run the seeding
seedProfessionals();