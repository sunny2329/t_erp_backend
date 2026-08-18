const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { sendSuccess } = require('./utils/response');

const app = express();

// Uploaded documents live in Supabase Storage and are served directly from
// there — cross-origin embedding (drawer previews) needs this disabled,
// same as the reference project's S3 objects being publicly readable.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Public health check (no auth, no prefix — simple infra probe)
app.get('/health', (req, res) => sendSuccess(res, { status: 'ok' }, 'Healthy'));

const apiPrefix = process.env.API_PREFIX || '/dispatch_api/v1';
app.use(apiPrefix, routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
