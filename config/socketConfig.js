const { Server } = require('socket.io');

let io;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    // ===== RIDE TRACKING =====
    // Join ride room
    socket.on('join-ride', (rideId) => {
      socket.join(`ride-${rideId}`);
      console.log(`User joined ride room: ride-${rideId}`);
    });

    // Leave ride room
    socket.on('leave-ride', (rideId) => {
      socket.leave(`ride-${rideId}`);
      console.log(`User left ride room: ride-${rideId}`);
    });

    // Driver location update (real-time streaming)
    socket.on('update-location', (data) => {
      const { rideId, latitude, longitude } = data;
      
      // Broadcast to all users in the ride room
      io.to(`ride-${rideId}`).emit('driver-location-updated', {
        latitude,
        longitude,
        timestamp: new Date()
      });
    });

    // Driver status updates
    socket.on('update-status', (data) => {
      const { rideId, status } = data;
      
      io.to(`ride-${rideId}`).emit('ride-status-updated', {
        rideId,
        status,
        timestamp: new Date()
      });
    });

    // ===== ORDER/SERVICE TRACKING =====
    // Join order room (for both user and admin)
    socket.on('join-order', (orderId) => {
      socket.join(`order-${orderId}`);
      console.log(`📦 Client joined order room: order-${orderId}`);
    });

    // Leave order room
    socket.on('leave-order', (orderId) => {
      socket.leave(`order-${orderId}`);
      console.log(`📦 Client left order room: order-${orderId}`);
    });

    // Join admin monitoring room (for all active orders)
    socket.on('join-admin-monitoring', () => {
      socket.join('admin-monitoring');
      console.log('👨‍💼 Admin joined monitoring room');
    });

    // Leave admin monitoring room
    socket.on('leave-admin-monitoring', () => {
      socket.leave('admin-monitoring');
      console.log('👨‍💼 Admin left monitoring room');
    });

    // User location update (for service orders)
    socket.on('update-user-location', (data) => {
      const { orderId, latitude, longitude, address } = data;
      
      console.log(`📍 User location update for order ${orderId}:`, { latitude, longitude });
      
      // Broadcast to specific order room
      io.to(`order-${orderId}`).emit('user-location-updated', {
        orderId,
        latitude,
        longitude,
        address,
        timestamp: new Date()
      });
      
      // Also broadcast to admin monitoring room
      io.to('admin-monitoring').emit('order-location-updated', {
        orderId,
        type: 'user',
        latitude,
        longitude,
        address,
        timestamp: new Date()
      });
    });

    // Professional location update (for service orders)
    socket.on('update-professional-location', (data) => {
      const { orderId, latitude, longitude } = data;
      
      console.log(`🔧 Professional location update for order ${orderId}:`, { latitude, longitude });
      
      // Broadcast to specific order room
      io.to(`order-${orderId}`).emit('professional-location-updated', {
        orderId,
        latitude,
        longitude,
        timestamp: new Date()
      });
      
      // Also broadcast to admin monitoring room
      io.to('admin-monitoring').emit('order-location-updated', {
        orderId,
        type: 'professional',
        latitude,
        longitude,
        timestamp: new Date()
      });
    });

    // Order status updates
    socket.on('update-order-status', (data) => {
      const { orderId, status } = data;
      
      console.log(`📊 Order status update: ${orderId} -> ${status}`);
      
      io.to(`order-${orderId}`).emit('order-status-updated', {
        orderId,
        status,
        timestamp: new Date()
      });
      
      // Notify admin
      io.to('admin-monitoring').emit('order-status-updated', {
        orderId,
        status,
        timestamp: new Date()
      });
    });

    // Notify when professional is assigned
    socket.on('professional-assigned', (data) => {
      const { orderId, professionalName } = data;
      
      console.log(`🔧 Professional assigned to order ${orderId}: ${professionalName}`);
      
      io.to(`order-${orderId}`).emit('professional-assigned-notification', {
        orderId,
        professionalName,
        timestamp: new Date()
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

module.exports = { initializeSocket, getIO };