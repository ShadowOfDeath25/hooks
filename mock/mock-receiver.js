import "dotenv/config";
import Fastify from "fastify";
import { setTimeout as delay } from "node:timers/promises";

const fastify = Fastify({ logger: true });

const port = Number(process.env.MOCK_PORT ?? 4000);
const timeoutDelayMs = Number(
  process.env.MOCK_TIMEOUT_MS ?? 10000
);

const attempts = new Map();
const requestLog = [];
const LOG_LIMIT = 100;

function getDeliveryId(request) {
  return (
    request.headers["x-delivery-id"] ??
    request.query?.delivery_id
  );
}

function saveRequest(request, outcome, attempt = null) {
  requestLog.unshift({
    time: new Date().toISOString(),
    method: request.method,
    url: request.url,
    deliveryId: getDeliveryId(request) ?? null,
    attempt,
    outcome,
    headers: request.headers,
    body: request.body
  });

  if (requestLog.length > LOG_LIMIT) {
    requestLog.length = LOG_LIMIT;
  }
}

// Always successful
fastify.post("/success", async (request, reply) => {
  saveRequest(request, "success");

  return reply.code(200).send({
    mock: true,
    result: "success"
  });
});

// Return any requested HTTP status
fastify.post("/status/:code", async (request, reply) => {
  const code = Number(request.params.code);

  if (!Number.isInteger(code) || code < 200 || code > 599) {
    return reply.code(400).send({
      mock: true,
      error: "Status code must be between 200 and 599"
    });
  }

  saveRequest(request, `status ${code}`);

  return reply.code(code).send({
    mock: true,
    status: code
  });
});

// Respond later than the webhook client's timeout
fastify.post("/timeout", async (request, reply) => {
  saveRequest(
    request,
    `delaying response for ${timeoutDelayMs}ms`
  );

  await delay(timeoutDelayMs);

  return reply.code(200).send({
    mock: true,
    result: "delayed success",
    delayedMs: timeoutDelayMs
  });
});

// First two attempts fail, third and later attempts succeed
fastify.post("/fail-twice", async (request, reply) => {
  const deliveryId = getDeliveryId(request);

  if (!deliveryId) {
    return reply.code(400).send({
      mock: true,
      error: "X-Delivery-Id header is required"
    });
  }

  const attempt = (attempts.get(deliveryId) ?? 0) + 1;
  attempts.set(deliveryId, attempt);

  if (attempt <= 2) {
    saveRequest(request, "simulated failure", attempt);

    return reply.code(500).send({
      mock: true,
      attempt,
      result: "failure"
    });
  }

  saveRequest(request, "success", attempt);

  return reply.code(200).send({
    mock: true,
    attempt,
    result: "success"
  });
});

// View received requests
fastify.get("/_mock/log", async () => {
  return requestLog;
});

// View current attempt counters
fastify.get("/_mock/state", async () => {
  return Object.fromEntries(attempts);
});

// Reset everything before starting another test
fastify.post("/_mock/reset", async () => {
  attempts.clear();
  requestLog.length = 0;

  return {
    mock: true,
    reset: true
  };
});

try {
  await fastify.listen({
    port,
    host: "0.0.0.0"
  });

  console.log(`Mock receiver running on port ${port}`);
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}