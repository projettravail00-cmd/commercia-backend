const express = require('express');
const cors = require('cors');
require('dotenv').config();

const storeRoutes = require('./routes/storeRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const botRoutes = require('./routes/botRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes API REST
app.use('/api/stores', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhook', botRoutes);
app.use('/api/session', sessionRoutes);

// Route d'état du serveur (Health check)
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'CommercIA SaaS Backend Engine',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[INFO] CommercIA Backend Server is running on port ${PORT}`);
  console.log(`[INFO] Health Check: http://localhost:${PORT}/health`);
  console.log(`==================================================`);
});

module.exports = app;
