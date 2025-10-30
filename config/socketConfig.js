// server/config/socketConfig.js
const socketIO = require('socket.io');

let io;

const initializeSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Store active tracking sessions
  const activeTracking = new Map();
  // Map professionalId to socketId
  const professionalSockets = new Map();
  // Map userId to socketId
  const userSockets = new Map();

  io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);

    // Professional connects and registers
    socket.on('professional:register', ({ professionalId, orderId }) => {
      console.log(`🚗 Professional ${professionalId} registered for order ${orderId}`);
      
      professionalSockets.set(professionalId, socket.id);
      socket.professionalId = professionalId;
      socket.orderId = orderId;
      
      // Join order-specific room
      socket.join(`order:${orderId}`);
      
      // Store tracking session
      activeTracking.set(orderId, {
        professionalId,
        professionalSocketId: socket.id,
        startedAt: new Date(),
        lastLocation: null
      });

      // Notify user that professional is ready
      io.to(`order:${orderId}`).emit('tracking:started', {
        orderId,
        professionalId,
        startedAt: new Date()
      });
    });

    // User connects to track their order
    socket.on('user:track', ({ userId, orderId }) => {
      console.log(`👤 User ${userId} tracking order ${orderId}`);
      
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.orderId = orderId;
      
      // Join order-specific room
      socket.join(`order:${orderId}`);

      // Send current tracking status if exists
      const trackingSession = activeTracking.get(orderId);
      if (trackingSession && trackingSession.lastLocation) {
        socket.emit('location:update', trackingSession.lastLocation);
      }
    });

    // Professional sends location updates
    socket.on('location:update', (locationData) => {
      const { orderId, latitude, longitude, heading, speed } = locationData;
      
      if (!orderId) {
        console.error('❌ Location update missing orderId');
        return;
      }

      const timestamp = new Date();
      const update = {
        orderId,
        latitude,
        longitude,
        heading: heading || 0,
        speed: speed || 0,
        timestamp
      };

      // Update tracking session
      const trackingSession = activeTracking.get(orderId);
      if (trackingSession) {
        trackingSession.lastLocation = update;
      }

      // Broadcast to all users tracking this order
      socket.to(`order:${orderId}`).emit('location:update', update);
      
      console.log(`📍 Location update for order ${orderId}:`, {
        lat: latitude.toFixed(6),
        lng: longitude.toFixed(6)
      });
    });

    // Professional arrives at destination
    socket.on('tracking:arrived', ({ orderId }) => {
      console.log(`🎯 Professional arrived at order ${orderId}`);
      
      io.to(`order:${orderId}`).emit('tracking:arrived', {
        orderId,
        arrivedAt: new Date()
      });
    });

    // Service completed
    socket.on('tracking:completed', ({ orderId }) => {
      console.log(`✅ Service completed for order ${orderId}`);
      
      io.to(`order:${orderId}`).emit('tracking:completed', {
        orderId,
        completedAt: new Date()
      });

      // Clean up tracking session
      activeTracking.delete(orderId);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);

      // Clean up professional socket mapping
      if (socket.professionalId) {
        professionalSockets.delete(socket.professionalId);
        
        // Notify users that professional disconnected
        if (socket.orderId) {
          io.to(`order:${socket.orderId}`).emit('tracking:disconnected', {
            orderId: socket.orderId,
            reason: 'Professional disconnected'
          });
        }
      }

      // Clean up user socket mapping
      if (socket.userId) {
        userSockets.delete(socket.userId);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

// Utility function to emit to specific order
const emitToOrder = (orderId, event, data) => {
  if (io) {
    io.to(`order:${orderId}`).emit(event, data);
  }
};

module.exports = {
  initializeSocket,
  getIO,
  emitToOrder
};