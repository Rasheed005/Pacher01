'use strict';

const mongoose = require('mongoose');
const config = require('./env');

// Connect to MongoDB. Availability: we surface connection errors clearly and
// let the caller decide whether to exit, rather than crashing silently.
async function connectDB() {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });

  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
