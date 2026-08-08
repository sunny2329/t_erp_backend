require('dotenv').config();

const app = require('./app');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`t-erp-backend listening on port ${PORT}`);
  console.log(`API prefix: ${process.env.API_PREFIX || '/dispatch_api/v1'}`);
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
