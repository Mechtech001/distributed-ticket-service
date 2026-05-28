const { Kafka } = require('kafkajs');

    const kafka = new Kafka({
      clientId: 'gateway-service',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
    });

    const producer = kafka.producer();

    const connectProducer = async () => {
      await producer.connect();
      console.log('Producer connected to Kafka');
    };

    const sendMessage = async (topic, message) => {
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }],
      });
    };

    module.exports = { connectProducer, sendMessage };