'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoSanitize = require('express-mongo-sanitize');

const config = require('./config/env');
const apiRouter = require('./routes');
const { ensureCsrfToken, csrfProtection } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Behind a reverse proxy in production, trust it so secure cookies work.
if (config.isProd) app.set('trust proxy', 1);

// ---- Availability / Confidentiality: secure HTTP headers + CSP ----
// All our scripts are external files, so we keep script-src strict ('self').
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// ---- Body parsing with a size cap (Availability: avoid memory abuse) ----
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ---- Integrity: strip Mongo operators ($ and .) from user input ----
app.use(mongoSanitize());

// ---- Sessions (persisted in MongoDB) ----
app.use(
  session({
    name: 'connect.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: config.mongoUri, ttl: 60 * 60 * 8 }),
    cookie: {
      httpOnly: true, // Confidentiality: JS cannot read the session cookie
      sameSite: 'lax', // CSRF mitigation
      secure: config.isProd, // HTTPS-only in production
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// Ensure a CSRF token + readable cookie exist for every visitor.
app.use(ensureCsrfToken);

// ---- Static frontend: the built React app (same origin as the API → no CORS) ----
// In development you normally run the Vite dev server (npm run dev) which proxies
// /api here; in production `npm run build` emits frontend/dist which we serve.
const clientDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(clientDir));

// ---- API (CSRF-protected for all state-changing methods) ----
app.use('/api', csrfProtection, apiRouter);

// 404 for unknown API routes (must come before the SPA fallback).
app.use('/api', notFound);

// Liveness probe for the platform health check. Unauthenticated and with no DB
// dependency, so a transient Atlas blip can't trigger a restart loop. Lives
// outside /api so the Vercel reverse proxy never forwards it here.
app.get('/healthz', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// SPA fallback: any non-API GET returns index.html so client-side routing works
// on deep links / refresh (e.g. /supervisor/project/:id).
app.get('*', (req, res, next) => {
  res.sendFile(path.join(clientDir, 'index.html'), (err) => {
    if (err) next(); // dist not built yet → fall through to the error handler
  });
});

// Global error handler (must be last).
app.use(errorHandler);

module.exports = app;
