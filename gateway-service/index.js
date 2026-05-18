const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Gateway is alive ✅' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ── BOOT ─────────────────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Gateway API running on port ${port}`);
  console.log(`📡 NGINX reverse proxy routes: /api/* → gateway:${port}`);
});
