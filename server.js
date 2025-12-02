const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const redis = require("redis")
const http = require("http")
const multer = require("multer")
const path = require("path")
require("dotenv").config()

// Import existing routes
const authRoutes = require("./routes/authRoutes")
const orderRoutes = require("./routes/orderRoutes")
const serviceRoutes = require("./routes/serviceRoutes")
const mediaRoutes = require("./routes/mediaRoutes")
const productRoutes = require("./routes/productRoutes")
const cartRoutes = require("./routes/cartRoutes")
const productCartRoutes = require("./routes/productCartRoutes")
const wishlistRoutes = require("./routes/wishlistRoutes")
const addressRoutes = require("./routes/addressRoutes")
const bookingRoutes = require("./routes/bookingRoutes")
const notificationRoutes = require("./routes/notificationRoutes")
const reviewRoutes = require("./routes/reviewRoutes")
const helpRoutes = require("./routes/helpRoutes")
const paymentRoutes = require("./routes/paymentRoutes")
const chatRoutes = require("./routes/chatRoutes")
const professionalRoutes = require("./routes/professionalRoutes")
const rideRoutes = require("./routes/rideRoutes") 
const driverRoutes = require("./routes/driverRoutes")
const stockNotificationRoutes = require("./routes/stockNotificationRoutes")
const walletRoutes = require("./routes/walletRoutes")
const giftCardRoutes = require('./routes/giftCardRoutes');
const pendingProfessionalRoutes = require('./routes/pendingProfessionalRoutes');
const salonRoutes = require('./routes/salonRoutes');
const salonbookingRoutes = require('./routes/salonbookingRoutes');
const borzoRoutes = require('./routes/borzoRoutes');
const bannerRoutes = require('./routes/sbannerRoutes');

// 🔔 NEW: Import push notification routes and services
const pushNotificationRoutes = require('./routes/pushNotificationRoutes');
const { initializeFCM } = require('./services/fcmService');
const { initializeCronJobs } = require('./cron/notificationCron');

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

const fs = require("fs")
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true })
}

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB Connected")
    
    // 🔔 Initialize Firebase Cloud Messaging after MongoDB connection
    initializeFCM();
    
    // 🔔 Initialize notification cron jobs
    initializeCronJobs();
  })
  .catch((err) => console.error("❌ MongoDB Connection Error:", err))

// Redis Connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
})

redisClient.on("connect", () => console.log("✅ Redis Connected"))
redisClient.on("error", (err) => console.error("❌ Redis Error:", err))

redisClient.connect().catch(console.error)

app.locals.redis = redisClient

// Existing Routes
app.use("/api/auth", authRoutes)
app.use("/api/services", serviceRoutes)
app.use("/api/media", mediaRoutes)
app.use("/api/products", productRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/product-cart", productCartRoutes)
app.use("/api/wishlist", wishlistRoutes)
app.use("/api/addresses", addressRoutes)
app.use("/api/bookings", bookingRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/reviews", reviewRoutes)
app.use("/api/help", helpRoutes)
app.use("/api/payments", paymentRoutes)
app.use("/api/chats", chatRoutes)
app.use("/api/professionals", professionalRoutes)
app.use("/api/rides", rideRoutes)
app.use("/api/driver", driverRoutes)
app.use("/api/stock-notifications", stockNotificationRoutes)
app.use("/api/wallet", walletRoutes)
app.use('/api/gift-cards', giftCardRoutes);
app.use('/api/pending-professionals',pendingProfessionalRoutes);
app.use('/api/salons', salonRoutes);
app.use('/api/salon-bookings', salonbookingRoutes);
app.use('/api/borzo', borzoRoutes);
app.use('/api/banners', bannerRoutes);

// 🔔 NEW: Push Notification Routes
app.use('/api/push-notifications', pushNotificationRoutes);

app.get("/", (req, res) => {
  res.json({ 
    message: "Husn API Server is running!",
    features: [
      "User Authentication",
      "Product Management",
      "Service Booking",
      "Push Notifications 🔔",
      "Payment Processing",
      "Real-time Chat",
      "and more..."
    ]
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ success: false, message: "Something went wrong!" })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" })
})

// Initialize Socket.IO
const { initializeSocket } = require("./config/socketConfig")
const io = initializeSocket(server)

app.set('io', io)

const PORT = process.env.PORT || 9000
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📱 Push notifications enabled`)
  console.log(`⏰ Scheduled notification cron active`)
})