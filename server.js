// server.js - Updated with new routes
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const redis = require('redis');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes'); 
const serviceRoutes = require('./routes/serviceRoutes');
const mediaRoutes = require('./routes/mediaRoutes'); 
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const productCartRoutes = require('./routes/productCartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const addressRoutes = require('./routes/addressRoutes');
// const productOrderRoutes = require('./routes/productOrderRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reviewRoutes = require('./routes/reviewRoutes'); 
const helpRoutes = require('./routes/helpRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const professionalRoutes = require('./routes/professionalRoutes'); 
// const professionalLocationRoutes = require('./routes/professionalLocationRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); 

const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));


const redisClient = redis.createClient({
  url: process.env.REDIS_URL 
});

redisClient.on('connect', () => console.log('✅ Redis Connected'));
redisClient.on('error', (err) => console.error('❌ Redis Error:', err));

redisClient.connect().catch(console.error);

app.locals.redis = redisClient;

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/media', mediaRoutes); 
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes); 
app.use('/api/product-cart', productCartRoutes); 
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
// app.use('/api/product-orders', productOrderRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes); 
app.use('/api/help', helpRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/professionals', professionalRoutes);
// app.use('/api/location', professionalLocationRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Booking System API Server is running!' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});