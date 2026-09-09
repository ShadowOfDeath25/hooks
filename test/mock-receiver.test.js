import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "http://127.0.0.1:4100";
const SECRET = "mock-test-secret-123";

let server;
let secretsPath;

function createSignature(eventId, timestamp, body) {
  const signedContent = `${eventId}.${timestamp}.${body}`;

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
    timestamp = Math.floor(Date.now() / 1000).toString()
  } = {}
) {
  return {
    "content-type": "application/json",
    "event-id": eventId,
    "webhook-timestamp": timestamp,
    "webhook-signature": createSignature(eventId, timestamp, body)
  };
}

async function post(
  path,
  {
    eventId = "evt-test",
    body = '{"test":true}',
    timestamp,
    signature
  } = {}
) {
  const headers = createHeaders(eventId, body, { timestamp });

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
  const response = await fetch(`${BASE_URL}/_mock/reset`, {
    method: "POST"
  });

  assert.equal(response.status, 200);
}

test.before(async () => {
  secretsPath = path.join(
    os.tmpdir(),
    `hooks-mock-secrets-${process.pid}.json`
  );

  await fs.writeFile(
    secretsPath,
    JSON.stringify({
      "/success": SECRET,
      "/status/:code": SECRET,
      "/timeout": SECRET,
      "/fail-twice": SECRET
    }),
    "utf8"
  );

  server = spawn(process.execPath, ["mock/mock-receiver.js"], {
    env: {
      ...process.env,
      MOCK_PORT: "4100",
      MOCK_TIMEOUT_MS: "200",
      MOCK_SECRETS_PATH: secretsPath
    },
    stdio: "pipe"
  });

  // Give Fastify time to start.
  await delay(1000);
});

test.after(async () => {
  if (server) {
    server.kill();
  }

  if (secretsPath) {
    await fs.rm(secretsPath, { force: true });
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

    const oldTimestamp = (
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

    const futureTimestamp = (
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

      const first = await post("/success", { eventId });
      assert.equal(first.status, 200);

      const second = await post("/success", { eventId });
      assert.equal(second.status, 200);

      const data = await second.json();
      assert.equal(data.result, "duplicate ignored");
    }
  );

  await t.test(
    "fail-twice gives 500, 500, then 200 for the same Event-Id",
    async () => {
      await reset();

      const eventId = "evt-retry";

      const first = await post("/fail-twice", { eventId });
      assert.equal(first.status, 500);
      assert.equal((await first.json()).attempt, 1);

      const second = await post("/fail-twice", { eventId });
      assert.equal(second.status, 500);
      assert.equal((await second.json()).attempt, 2);

      const third = await post("/fail-twice", { eventId });
      assert.equal(third.status, 200);

      const thirdBody = await third.json();
      assert.equal(thirdBody.attempt, 3);
      assert.equal(thirdBody.result, "success");
    }
  );

  await t.test(
    "fail-twice counters are keyed by Event-Id",
    async () => {
      await reset();

      const firstA = await post("/fail-twice", {
        eventId: "evt-a"
      });
      assert.equal(firstA.status, 500);
      assert.equal((await firstA.json()).attempt, 1);

      const firstB = await post("/fail-twice", {
        eventId: "evt-b"
      });
      assert.equal(firstB.status, 500);
      assert.equal((await firstB.json()).attempt, 1);

      const secondA = await post("/fail-twice", {
        eventId: "evt-a"
      });
      assert.equal(secondA.status, 500);
      assert.equal((await secondA.json()).attempt, 2);
    }
  );

  await t.test(
    "fourth delivery is ignored after successful processing",
    async () => {
      await reset();

      const eventId = "evt-duplicate-after-success";

      await post("/fail-twice", { eventId });
      await post("/fail-twice", { eventId });
      await post("/fail-twice", { eventId });

      const fourth = await post("/fail-twice", { eventId });
      assert.equal(fourth.status, 200);

      const data = await fourth.json();
      assert.equal(data.result, "duplicate ignored");
    }
  );

  await t.test(
    "failed response is not marked processed",
    async () => {
      await reset();

      const eventId = "evt-status-500";

      const first = await post("/status/500", { eventId });
      assert.equal(first.status, 500);

      const second = await post("/status/500", { eventId });

      // A failed response must still be processed again, not deduplicated.
      assert.equal(second.status, 500);
    }
  );

  await t.test("2xx response is marked processed", async () => {
    await reset();

    const eventId = "evt-status-201";

    const first = await post("/status/201", { eventId });
    assert.equal(first.status, 201);

    const second = await post("/status/201", { eventId });
    assert.equal(second.status, 200);

    const data = await second.json();
    assert.equal(data.result, "duplicate ignored");
  });

  await t.test("state shows retry and processed data", async () => {
    await reset();

    const eventId = "evt-state";

    await post("/fail-twice", { eventId });
    await post("/fail-twice", { eventId });
    await post("/fail-twice", { eventId });

    const response = await fetch(`${BASE_URL}/_mock/state`);
    assert.equal(response.status, 200);

    const state = await response.json();

    assert.equal(state.attempts[eventId], 3);
    assert.ok(
      state.processedEvents.includes(`/fail-twice:${eventId}`)
    );
  });

  await t.test("reset clears mock state", async () => {
    await reset();

    const response = await fetch(`${BASE_URL}/_mock/state`);
    assert.equal(response.status, 200);

    const state = await response.json();

    assert.deepEqual(state.attempts, {});
    assert.deepEqual(state.processedEvents, []);
  });
});
