const request = require("supertest");

const mockSend = jest.fn().mockResolvedValue(undefined);
const mockProducerConnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerConnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerSubscribe = jest.fn().mockResolvedValue(undefined);
const mockConsumerRun = jest.fn().mockResolvedValue(undefined);

jest.mock("kafkajs", () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn(() => ({
      connect: mockProducerConnect,
      send: mockSend,
    })),
    consumer: jest.fn(() => ({
      connect: mockConsumerConnect,
      subscribe: mockConsumerSubscribe,
      run: mockConsumerRun,
    })),
  })),
}));

jest.mock("socket.io", () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
  })),
}));

const app = require("./index");

beforeEach(() => {
  mockSend.mockClear();
  mockProducerConnect.mockClear();
  mockConsumerConnect.mockClear();
  mockConsumerSubscribe.mockClear();
  mockConsumerRun.mockClear();
});

describe("gateway-service integration", () => {
  it("responds 200 on / with the health payload", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Gateway is alive");
  });

  it("queues a ticket via Kafka and returns 202", async () => {
    const res = await request(app)
      .post("/api/ticket")
      .set("Content-Type", "application/json")
      .send({ userId: "user-123", event: "Monaco GP" });

    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe("pending");
    expect(mockSend).toHaveBeenCalledTimes(1);

    const call = mockSend.mock.calls[0][0];
    expect(call.topic).toBe("ticket_request");
    const payload = JSON.parse(call.messages[0].value);
    expect(payload.userId).toBe("user-123");
    expect(payload.event).toBe("Monaco GP");
    expect(payload).toHaveProperty("timestamp");
  });

  it("uses the default event when not provided", async () => {
    const res = await request(app)
      .post("/api/ticket")
      .set("Content-Type", "application/json")
      .send({ userId: "user-456" });

    expect(res.statusCode).toBe(202);
    const payload = JSON.parse(mockSend.mock.calls[0][0].messages[0].value);
    expect(payload.event).toBe("concert");
  });

  it("returns 500 when the Kafka send fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("broker unavailable"));
    const res = await request(app)
      .post("/api/ticket")
      .set("Content-Type", "application/json")
      .send({ userId: "user-789", event: "F1" });

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Failed to queue ticket");
  });
});
