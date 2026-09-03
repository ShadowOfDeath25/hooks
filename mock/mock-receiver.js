import "dotenv/config";
import Fastify from "fastify";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const fastify = Fastify({ logger: true });

const port = Number(process.env.MOCK_PORT ?? 4000);
const timeoutDelayMs = Number(
  process.env.MOCK_TIMEOUT_MS ?? 10000
);
const webhookSecret = process.env.MOCK_WEBHOOK_SECRET;

if (!webhookSecret) {
  throw new Error(
    "MOCK_WEBHOOK_SECRET is required for HMAC verification"
  );
}
fastify.removeContentTypeParser("application/json");

fastify.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (request, body, done) => {
    request.rawBody = body;

    try {
      done(null, JSON.parse(body.toString("utf8")));
    } catch (error) {
      error.statusCode = 400;
      done(error, undefined);
    }
  }
);
const attempts = new Map();
const deliveryEventIds = new Map();
const processedEvents = new Set();
const requestLog = [];

const LOG_LIMIT = 100;
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function getProcessingKey(request) {
  const eventId = request.headers["event-id"];
  const path = request.url.split("?")[0];

  return `${path}:${eventId}`;
}
function getDeliveryId(request) {
  return (
    request.headers["x-delivery-id"] ??
    request.query?.delivery_id
  );
}
function verifyStableEventId(request, reply, done) {
  const deliveryId = getDeliveryId(request);
  const eventId = request.headers["event-id"];

  if (!deliveryId) {
    reply.code(400).send({
      mock: true,
      error: "X-Delivery-Id header is required"
    });
    return;
  }

  if (typeof eventId !== "string") {
    reply.code(400).send({
      mock: true,
      error: "Event-Id header is required"
    });
    return;
  }

  const existingEventId = deliveryEventIds.get(deliveryId);

  // First attempt: remember which event belongs to this delivery
  if (!existingEventId) {
    deliveryEventIds.set(deliveryId, eventId);
    done();
    return;
  }

  // Retry: event ID MUST remain the same
  if (existingEventId !== eventId) {
    reply.code(409).send({
      mock: true,
      error: "Event-Id changed between delivery attempts",
      expectedEventId: existingEventId,
      receivedEventId: eventId
    });
    return;
  }

  done();
}
function skipIfAlreadyProcessed(request, reply, done) {
  const eventId = request.headers["event-id"];
  const processingKey = getProcessingKey(request);

  if (processedEvents.has(processingKey)) {
    saveRequest(request, "duplicate ignored");

    reply.code(200).send({
      mock: true,
      result: "duplicate ignored",
      eventId
    });

    return;
  }

  done();
}
function verifyHmac(request, reply, done) {
  const eventId = request.headers["event-id"];
  const timestamp = request.headers["webhook-timestamp"];
  const signatureHeader =
    request.headers["webhook-signature"];

  if (
  typeof eventId !== "string" ||
  typeof timestamp !== "string" ||
  typeof signatureHeader !== "string"
) {
  reply.code(401).send({
    mock: true,
    error:
      "Event-Id, Webhook-Timestamp and Webhook-Signature headers are required"
  });
  return;
}

// Replay protection
if (!/^\d+$/.test(timestamp)) {
  reply.code(401).send({
    mock: true,
    error: "Invalid Webhook-Timestamp"
  });
  return;
}

const timestampSeconds = Number(timestamp);
const nowSeconds = Math.floor(Date.now() / 1000);

if (
  !Number.isSafeInteger(timestampSeconds) ||
  Math.abs(nowSeconds - timestampSeconds) >
    TIMESTAMP_TOLERANCE_SECONDS
) {
  reply.code(401).send({
    mock: true,
    error: "Webhook timestamp is outside the allowed tolerance"
  });
  return;
}

const rawBody = request.rawBody ?? Buffer.alloc(0);

  const signedContent = Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`, "utf8"),
    rawBody
  ]);

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedContent)
    .digest();

  const signatures = signatureHeader.trim().split(/\s+/);

  const isValid = signatures.some((versionedSignature) => {
    const separatorIndex = versionedSignature.indexOf(",");

    if (separatorIndex === -1) {
      return false;
    }

    const version = versionedSignature.slice(
      0,
      separatorIndex
    );

    const encodedSignature = versionedSignature.slice(
      separatorIndex + 1
    );

    if (version !== "v1" || !encodedSignature) {
      return false;
    }

    const receivedSignature = Buffer.from(
      encodedSignature,
      "base64"
    );

    return (
      receivedSignature.length ===
        expectedSignature.length &&
      crypto.timingSafeEqual(
        receivedSignature,
        expectedSignature
      )
    );
  });

  if (!isValid) {
    reply.code(401).send({
      mock: true,
      error: "Invalid webhook signature"
    });
    return;
  }

  done();
}

function saveRequest(request, outcome, attempt = null) {
  requestLog.unshift({
    time: new Date().toISOString(),
    method: request.method,
    url: request.url,
    deliveryId: getDeliveryId(request) ?? null,
    eventId: request.headers["event-id"] ?? null,
    attempt,
    outcome,
    headers: request.headers,
    body: request.body
  });

  if (requestLog.length > LOG_LIMIT) {
    requestLog.length = LOG_LIMIT;
  }
}

fastify.get("/health", async (_request, reply) => {
  return reply.code(200).send({
    message: "server is up"
  });
});

// Always successful
fastify.post(
  "/success",
  {
    preHandler: [
      verifyHmac,
      skipIfAlreadyProcessed
    ]
  },
  async (request, reply) => {
    saveRequest(request, "success");

    processedEvents.add(getProcessingKey(request));

    return reply.code(200).send({
      mock: true,
      result: "success"
    });
  }
);

// Return any requested HTTP status
fastify.post(
  "/status/:code",
  {
  preHandler: [
    verifyHmac,
    skipIfAlreadyProcessed
  ]
},
  async (request, reply) => {
    const code = Number(request.params.code);

    if (
      !Number.isInteger(code) ||
      code < 200 ||
      code > 599
    ) {
      return reply.code(400).send({
        mock: true,
        error:
          "Status code must be between 200 and 599"
      });
    }

    saveRequest(request, `status ${code}`);
    if (code >= 200 && code < 300) {
        processedEvents.add(getProcessingKey(request));
    }

    return reply.code(code).send({
      mock: true,
      status: code
    });
  }
);

// Respond later than the webhook client's timeout
fastify.post(
  "/timeout",
  {
  preHandler: [
    verifyHmac,
    skipIfAlreadyProcessed
  ]
},
  async (request, reply) => {
    saveRequest(
      request,
      `delaying response for ${timeoutDelayMs}ms`
    );

    await delay(timeoutDelayMs);
    processedEvents.add(getProcessingKey(request));

    return reply.code(200).send({
      mock: true,
      result: "delayed success",
      delayedMs: timeoutDelayMs
    });
  }
);

// First two attempts fail, third and later attempts succeed
fastify.post(
  "/fail-twice",
  {
    preHandler: [
  verifyHmac,
  verifyStableEventId,
  skipIfAlreadyProcessed
]
  },
  async (request, reply) => {
    const deliveryId = getDeliveryId(request);

    const attempt =
      (attempts.get(deliveryId) ?? 0) + 1;

    attempts.set(deliveryId, attempt);

    if (attempt <= 2) {
      saveRequest(
        request,
        "simulated failure",
        attempt
      );

      return reply.code(500).send({
        mock: true,
        attempt,
        result: "failure"
      });
    }
    processedEvents.add(getProcessingKey(request));

    saveRequest(request, "success", attempt);

    return reply.code(200).send({
      mock: true,
      attempt,
      result: "success"
    });
  }
);
// View received requests
fastify.get("/_mock/log", async () => {
  return requestLog;
});

// View current attempt counters
fastify.get("/_mock/state", async () => {
  return {
    attempts: Object.fromEntries(attempts),
    deliveryEventIds: Object.fromEntries(deliveryEventIds),
    processedEvents: Array.from(processedEvents)
  };
});

// Reset everything before starting another test
fastify.post("/_mock/reset", async () => {
  attempts.clear();
  deliveryEventIds.clear();
  processedEvents.clear();
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