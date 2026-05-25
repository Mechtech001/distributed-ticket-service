const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');

// --- DATABASE SETUP ----------------------------------------------------------
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/tickets')
  .then(() => console.log('[WORKER] Connected to MongoDB'))
  .catch(err => console.error('[WORKER] MongoDB connection error:', err));

const Ticket = mongoose.model('Ticket', {
  userId: String,
  event: String,
  status: String,
  processedAt: Date,
});

// --- KAFKA SETUP -------------------------------------------------------------
const kafka = new Kafka({
  clientId: 'worker-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
});

const consumer = kafka.consumer({ groupId: 'worker-processing-group' });
const producer = kafka.producer();

// --- MAIN PROCESSING LOOP ----------------------------------------------------
const start = async () => {
  let connected = false;

  // 1. Connection Retry Loop for Kafka
  while (!connected) {
    try {
      await consumer.connect();
      await producer.connect();
      console.log('[WORKER] Connected to Kafka (Consumer and Producer ready)');
      connected = true;
    } catch (err) {
      console.log('[WORKER] Kafka not ready yet... retrying in 5 seconds');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // 2. Subscribe to the incoming requests topic
  await consumer.subscribe({ topic: 'ticket_request', fromBeginning: false });
  console.log('[WORKER] Listening for incoming ticket requests...');

  // 3. Process Messages
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const { userId, event, timestamp } = JSON.parse(message.value.toString());
        console.log(`[WORKER] Received ticket request for user: ${userId}`);

        // A. SAVE TO DATABASE
        const ticket = new Ticket({
          userId,
          event: event || 'concert',
          status: 'CONFIRMED',
          processedAt: new Date(),
        });
        await ticket.save();
        console.log(`[WORKER] Ticket saved to MongoDB. ID: ${ticket._id}`);

        // B. SEND COMPLETION EVENT BACK TO KAFKA
        await producer.send({
          topic: 'ticket_completed',
          messages: [
            {
              value: JSON.stringify({
                userId,
                ticketId: ticket._id,
                event: ticket.event,
                status: ticket.status,
                processedAt: ticket.processedAt,
              }),
            },
          ],
        });
        console.log(`[WORKER] Completion event sent back to Gateway for Ticket: ${ticket._id}`);

      } catch (error) {
        console.error('[WORKER] Error processing message:', error.message);
      }
    },
  });
};

// --- BOOT --------------------------------------------------------------------
start().catch(async (error) => {
  console.error(`[WORKER] Fatal error: ${error.message}`);
  // Restart loop on fatal crash
  setTimeout(start, 5000);
});
