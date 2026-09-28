'use strict';

const app = require('./app');
const config = require('./config/env');
const { connectDB } = require('./config/db');

// Start order: connect to MongoDB first, then accept traffic. If the DB is
// unreachable we exit with a clear message instead of serving broken requests.
async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('\n[startup] Could not connect to MongoDB at', config.mongoUri);
    console.error('[startup]', err.message);
    console.error('[startup] Is mongod running? Or set MONGO_URI to your Atlas URI in .env\n');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[server] Pacher backend listening on http://localhost:${config.port}`);
    console.log(`[server] environment: ${config.nodeEnv}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
