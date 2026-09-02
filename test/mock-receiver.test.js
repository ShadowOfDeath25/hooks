import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "http://127.0.0.1:4100";
const SECRET = "mock-test-secret-123";

let server;

function createSignature(eventId, timestamp, body) {
  const signedContent =
    `${eventId}.${timestamp}.${body}`;

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(signedContent)
    .digest("base64");

  return `v1,${signature}`;
}

function createHeaders(
  eventId,
  body,
  {
    timestamp = Math.floor(Date.now() / 1000).toString(),
    deliveryId
  } = {}
) {
  const headers = {
    "content-type": "application/json",
    "event-id": eventId,
    "webhook-timestamp": timestamp,
    "webhook-signature":
      createSignature(eventId, timestamp, body)
  };

  if (deliveryId) {
    headers["x-delivery-id"] = deliveryId;
  }

  return headers;
}

async function post(
  path,
  {
    eventId = "evt-test",
    deliveryId,
    body = '{"test":true}',
    timestamp,
    signature
  } = {}
) {
  const headers = createHeaders(
    eventId,
    body,
    {
      timestamp,
      deliveryId
    }
  );

  if (signature !== undefined) {
    headers["webhook-signature"] = signature;
  }

  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body
  });
}

async function reset() {
  const response = await fetch(
    `${BASE_URL}/_mock/reset`,
    {
      method: "POST"
    }
  );

  assert.equal(response.status, 200);
}

test.before(async () => {
  server = spawn(
    process.execPath,
    ["mock/mock-receiver.js"],
    {
      env: {
        ...process.env,
        MOCK_PORT: "4100",
        MOCK_TIMEOUT_MS: "200",
        MOCK_WEBHOOK_SECRET: SECRET
      },
      stdio: "pipe"
    }
  );

  // Give Fastify time to start
  await delay(1000);
});

test.after(() => {
  if (server) {
    server.kill();
  }
});

test("Mock receiver full test suite", async (t) => {

  await t.test("valid HMAC returns 200", async () => {
    await reset();

    const response = await post("/success", {
      eventId: "evt-valid"
    });

    assert.equal(response.status, 200);

    const data = await response.json();

    assert.equal(data.result, "success");
  });


  await t.test("wrong HMAC returns 401", async () => {
    await reset();

    const response = await post("/success", {
      eventId: "evt-bad-signature",
      signature: "v1,AAAA"
    });

    assert.equal(response.status, 401);
  });


  await t.test("old timestamp is rejected", async () => {
    await reset();

    const oldTimestamp =
      (
        Math.floor(Date.now() / 1000) - 3600
      ).toString();

    const response = await post("/success", {
      eventId: "evt-old",
      timestamp: oldTimestamp
    });

    assert.equal(response.status, 401);

    const data = await response.json();

    assert.equal(
      data.error,
      "Webhook timestamp is outside the allowed tolerance"
    );
  });


  await t.test("future timestamp is rejected", async () => {
    await reset();

    const futureTimestamp =
      (
        Math.floor(Date.now() / 1000) + 3600
      ).toString();

    const response = await post("/success", {
      eventId: "evt-future",
      timestamp: futureTimestamp
    });

    assert.equal(response.status, 401);
  });


  await t.test(
    "successful event is ignored when received again",
    async () => {
      await reset();

      const eventId = "evt-idempotent";

      const first = await post("/success", {
        eventId
      });

      assert.equal(first.status, 200);

      const second = await post("/success", {
        eventId
      });

      assert.equal(second.status, 200);

      const data = await second.json();

      assert.equal(
        data.result,
        "duplicate ignored"
      );
    }
  );


  await t.test(
    "fail-twice gives 500, 500, then 200",
    async () => {
      await reset();

      const eventId = "evt-retry";
      const deliveryId = "delivery-retry";

      const first = await post("/fail-twice", {
        eventId,
        deliveryId
      });

      assert.equal(first.status, 500);

      const firstBody = await first.json();
      assert.equal(firstBody.attempt, 1);


      const second = await post("/fail-twice", {
        eventId,
        deliveryId
      });

      assert.equal(second.status, 500);

      const secondBody = await second.json();
      assert.equal(secondBody.attempt, 2);


      const third = await post("/fail-twice", {
        eventId,
        deliveryId
      });

      assert.equal(third.status, 200);

      const thirdBody = await third.json();
      assert.equal(thirdBody.attempt, 3);
      assert.equal(thirdBody.result, "success");
    }
  );


  await t.test(
    "fourth retry is ignored after successful processing",
    async () => {
      await reset();

      const eventId = "evt-duplicate-after-success";
      const deliveryId = "delivery-duplicate";

      await post("/fail-twice", {
        eventId,
        deliveryId
      });

      await post("/fail-twice", {
        eventId,
        deliveryId
      });

      await post("/fail-twice", {
        eventId,
        deliveryId
      });

      const fourth = await post("/fail-twice", {
        eventId,
        deliveryId
      });

      assert.equal(fourth.status, 200);

      const data = await fourth.json();

      assert.equal(
        data.result,
        "duplicate ignored"
      );
    }
  );


  await t.test(
    "same delivery must keep same Event-Id",
    async () => {
      await reset();

      const deliveryId = "delivery-stable-id";

      const first = await post("/fail-twice", {
        eventId: "evt-original",
        deliveryId
      });

      assert.equal(first.status, 500);


      const second = await post("/fail-twice", {
        eventId: "evt-CHANGED",
        deliveryId
      });

      assert.equal(second.status, 409);

      const data = await second.json();

      assert.equal(
        data.error,
        "Event-Id changed between delivery attempts"
      );

      assert.equal(
        data.expectedEventId,
        "evt-original"
      );

      assert.equal(
        data.receivedEventId,
        "evt-CHANGED"
      );
    }
  );


  await t.test(
    "failed response is not marked processed",
    async () => {
      await reset();

      const eventId = "evt-status-500";

      const first = await post("/status/500", {
        eventId
      });

      assert.equal(first.status, 500);

      const second = await post("/status/500", {
        eventId
      });

      // Must still run again, not be deduplicated
      assert.equal(second.status, 500);
    }
  );


  await t.test(
    "2xx response is marked processed",
    async () => {
      await reset();

      const eventId = "evt-status-201";

      const first = await post("/status/201", {
        eventId
      });

      assert.equal(first.status, 201);

      const second = await post("/status/201", {
        eventId
      });

      assert.equal(second.status, 200);

      const data = await second.json();

      assert.equal(
        data.result,
        "duplicate ignored"
      );
    }
  );


  await t.test(
    "state shows retry and processed data",
    async () => {
      await reset();

      const eventId = "evt-state";
      const deliveryId = "delivery-state";

      await post("/fail-twice", {
        eventId,
        deliveryId
      });

      await post("/fail-twice", {
        eventId,
        deliveryId
      });

      await post("/fail-twice", {
        eventId,
        deliveryId
      });

      const response = await fetch(
        `${BASE_URL}/_mock/state`
      );

      assert.equal(response.status, 200);

      const state = await response.json();

      assert.equal(
        state.attempts[deliveryId],
        3
      );

      assert.equal(
        state.deliveryEventIds[deliveryId],
        eventId
      );

      assert.ok(
        state.processedEvents.includes(
          `/fail-twice:${eventId}`
        )
      );
    }
  );


  await t.test(
    "reset clears mock state",
    async () => {
      await reset();

      const response = await fetch(
        `${BASE_URL}/_mock/state`
      );

      const state = await response.json();

      assert.deepEqual(state.attempts, {});
      assert.deepEqual(
        state.deliveryEventIds,
        {}
      );
      assert.deepEqual(
        state.processedEvents,
        []
      );
    }
  );
});