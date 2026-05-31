# Fix: React (Vite) <-> Dockerized Node.js Gateway -- Network Bridge

This document explains every bug that caused the **"Network Error" / Connection Refused** issue between the Vite frontend and the Dockerized Gateway service, and exactly what was changed to fix it.

---

## Root Cause Summary

| # | Bug | Why It Happened |
|---|-----|-----------------|
| 1 | `[::1]:3000` -- IPv6 trap | Windows resolves `localhost` -> `[::1]` (IPv6), but Docker binds ports to IPv4 by default |
| 2 | No CORS on HTTP routes | `cors` middleware was only applied to Socket.IO, not to `app.use()` |
| 3 | Kafka producer reconnected per-request | `producer.connect()` was called inside the POST handler, causing multiple connections |
| 4 | Socket.IO CORS used wildcard `*` | `origin: '*'` doesn't work with `credentials: true` -- browser blocks it |
| 5 | Nginx missing WebSocket upgrade headers | `/socket.io/` lacked `Upgrade` and `Connection` headers -- WebSocket handshake failed silently |
| 6 | Frontend used hardcoded `http://127.0.0.1:3000` | Fragile and bypasses any proxy configuration |

---

## Files Changed

### 1. `docker-compose.yml`

**Problem:** Port `3000:3000` lets Docker bind to `0.0.0.0`, but the browser resolves `localhost` to IPv6 `[::1]`. Docker doesn't listen on IPv6, so every browser request gets **Connection Refused** even though `curl` works fine.

```diff
- ports:
-   - "3000:3000"
+ ports:
+   - "127.0.0.1:3000:3000"
```

**Why:** Explicitly binding to `127.0.0.1` forces the host-side of the port mapping to the IPv4 loopback. The browser and Docker now agree on the same address.

---

### 2. `gateway-service/index.js`

**Problems fixed:**

#### A -- Added HTTP-level CORS middleware
Previously, only Socket.IO had a `cors` option. Axios `POST /api/ticket` went through Express's plain HTTP stack, which had zero CORS headers -- the browser blocked it before the request even left the machine.

```js
// ADDED -- must be BEFORE route definitions
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

#### B -- Socket.IO CORS: replaced `*` with explicit origins
`origin: '*'` is incompatible with `credentials: true`. Replaced with a specific list.

```diff
- cors: { origin: '*' }
+ cors: {
+   origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
+   methods: ['GET', 'POST'],
+   credentials: true,
+ }
```

#### C -- Kafka producer connects once at startup, not per-request
```diff
- app.post('/api/ticket', async (req, res) => {
-   await producer.connect();  // reconnects every single request
-   await producer.send(...)

+ // In start():
+ await producer.connect();  // once at boot
+
+ app.post('/api/ticket', async (req, res) => {
+   await producer.send(...)  // producer already connected
```

---

### 3. `frontend/vite.config.js`

**Problem:** The frontend was making cross-origin requests directly to `http://127.0.0.1:3000`, which triggers CORS preflight checks and breaks WebSocket connections.

**Fix:** Added a Vite dev server proxy. The browser makes **same-origin** requests to `localhost:5173`, and Vite silently forwards them to `127.0.0.1:3000`. No CORS, no IPv6 issues.

```js
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:3000',
      changeOrigin: true,
    },
    '/socket.io': {
      target: 'http://127.0.0.1:3000',
      changeOrigin: true,
      ws: true,  // WebSocket proxying
    },
  },
},
```

---

### 4. `frontend/src/App.jsx`

**Problem:** Hardcoded `http://127.0.0.1:3000` in both Axios and Socket.IO -- bypasses the Vite proxy and re-introduces CORS/IPv6 fragility.

**Fix:** Switched to relative URLs that flow through the Vite proxy.

```diff
- const socket = io('http://127.0.0.1:3000');
+ const socket = io('/', { path: '/socket.io' });

- await axios.post('http://127.0.0.1:3000/api/ticket', ...)
+ await axios.post('/api/ticket', ...)
```

Also added `connect` and `connect_error` Socket.IO event listeners for better debugging.

---

### 5. `nginx/default.conf`

**Problem:** The original config had a single `location /` block proxying everything to the gateway. This works for HTTP, but WebSocket connections require special HTTP upgrade headers. Without them, nginx drops the connection before the Socket.IO handshake completes.

**Fix:** Added a dedicated `/socket.io/` location block with the correct headers:

```nginx
location /socket.io/ {
    proxy_pass http://gateway:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## How to Run After These Fixes

```powershell
# 1. Rebuild the gateway image (picks up index.js changes)
docker compose down
docker compose build --no-cache gateway
docker compose up -d

# 2. Start the Vite frontend (in a separate terminal)
cd frontend
npm run dev
```

Then open **http://localhost:5173** -- the Vite proxy handles all routing to Docker automatically.

---

## Request Flow (After Fix)

```
Browser (localhost:5173)
    |
    |  POST /api/ticket  (same-origin, no CORS)
    v
Vite Dev Server
    |
    |  forwards to http://127.0.0.1:3000/api/ticket
    v
Docker Gateway (127.0.0.1:3000)  <- IPv4 explicit binding
    |
    |  Kafka produce -> ticket_request topic
    v
Worker Service
    |
    |  Kafka consume -> ticket_completed topic
    v
Docker Gateway
    |
    |  io.emit('ticket_update')
    v
Browser WebSocket  <- via Vite proxy ws:true
    |
    |  React state update -> UI shows ticket ID
    v
  SUCCESS
```
