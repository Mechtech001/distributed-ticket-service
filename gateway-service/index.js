const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { Kafka } = require('kafkajs');

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

// ─── HTTP SERVER + SOCKET.IO ──────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// ─── KAFKA SETUP ──────────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'gateway-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'gateway-group' });

// ─── KAFKA CONSUMER (Broadcasts completions via WebSocket) ───────────────────
const listenForCompletions = async () => {
  let connected = false;
  while (!connected) {
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: 'ticket_completed', fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ message }) => {
          const result = JSON.parse(message.value.toString());
          console.log('🔔 GATEWAY: Worker finished!', result);
          
          // Instantly push the result to the React frontend
          io.emit('ticket_update', result);
        },
      });
      connected = true;
    } catch (error) {
      console.log('⏳ Kafka not ready yet. Retrying in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Gateway is alive ✅' });
});

app.post('/api/ticket', async (req, res) => {
  const { userId, event } = req.body;
  try {
    await producer.send({
      topic: 'ticket_request',
      messages: [
        {
          value: JSON.stringify({
            userId,
            event: event || 'concert',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
    res.status(202).json({ message: 'Ticket queued', status: 'pending' });
  } catch (error) {
    console.error('❌ Kafka send failed:', error.message);
    res.status(500).json({ error: 'Failed to queue ticket' });
  }
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await producer.connect();
    console.log('✅ Kafka producer connected');
  } catch (err) {
    console.warn('⚠️  Kafka producer not ready at startup, will retry on first request:', err.message);
  }

  listenForCompletions();

  // Bind to 0.0.0.0 for Docker/Kubernetes network mapping
  server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Gateway API & WebSockets running on port ${port}`);
  });
};

start();