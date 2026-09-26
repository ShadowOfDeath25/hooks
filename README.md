# Hooks

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)]()
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)]()
[![Docker Pulls](https://img.shields.io/badge/docker-ready-blue.svg)]()

**Hooks** is a robust, scalable, and self-hosted webhook delivery microservice. It allows you to reliably broadcast events to external consumer endpoints with built-in retry mechanisms, rate limiting, secure payload signing, and circuit breaking.

Built with **Fastify**, **BullMQ**, **Redis**, and **PostgreSQL (via Drizzle ORM)**.

---

## Table of Contents
- [Architecture & Core Concepts](#architecture--core-concepts)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start (Local Development)](#quick-start)
- [Environment Variables](#environment-variables)
- [Integration Guide (Publisher Flow)](#integration-guide-publisher-flow)
- [Integration Guide (Subscriber Flow)](#integration-guide-subscriber-flow)
- [API Reference & OpenAPI Swagger UI](#api-reference--openapi-swagger-ui)

---

## Architecture & Core Concepts

Hooks is composed of two main components:
1. **API Server (Fastify)**: Receives events, manages consumers/endpoints, and enqueues webhook delivery jobs to Redis.
2. **Background Worker (BullMQ)**: Consumes jobs from Redis, enforces rate limits, handles HTTP POST requests to consumer endpoints, and executes retry logic.

### Database Schema Overview
- **Consumers**: Represents external systems or users subscribing to events.
- **Endpoints**: Specific URLs where a Consumer expects to receive webhooks. Endpoints store AES-256-GCM encrypted signing secrets.
- **Events**: A recorded occurrence of an action in the system. Maximum payload size is 1MB.
- **Deliveries**: The relationship between an Event and an Endpoint. Tracks the final delivery status (`pending`, `success`, `failed`).
- **Attempts**: Individual HTTP requests made for a Delivery, logging response times, status codes, and HTTP errors.

---

## Key Features

- **Reliable Delivery & Retries**: Built on BullMQ and Redis. Includes custom exponential backoff with jitter to gracefully handle temporary downstream failures (HTTP 429, 5xx).
- **Rate Limiting**: Protects downstream systems by controlling the rate of webhook deliveries per endpoint.
- **Security & Payload Signing**: Secures webhook deliveries using AES-256-GCM encrypted secrets at rest and HMAC-SHA256 signatures (`v1,<base64-signature>`) in transit to prevent tampering and replay attacks.
- **Circuit Breaker**: Automatically disables (`isActive: false`) endpoints that exhibit consecutive terminal failures (e.g., 5 consecutive failed deliveries), saving resources and preventing useless network calls.
- **Fastify & PostgreSQL**: High-performance API routing backed by Postgres for strongly consistent state management.

---

## Prerequisites

- **Node.js >= 22** (Strict requirement due to dependencies like `chalk@6.x`). Node.js 24 is used in the Dockerfile.
- **Docker and Docker Compose** (recommended for easy setup)
- **PostgreSQL >= 15** (if running bare-metal)
- **Redis >= 8** (if running bare-metal)

---

## Quick Start

### Option 1: Docker Compose (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ShadowOfDeath25/hooks.git
   cd hooks
   ```

2. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   **Important:** You must set `ENCRYPTION_KEY_V1` to a valid 64-character hex string (32 bytes). Example generation: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

3. **Start the services:**
   ```bash
   docker compose up -d
   ```
   This spins up the Fastify API (port 3000), BullMQ Worker, Postgres, and Redis.

4. **Run Database Migrations:**
   ```bash
   docker compose exec app npm run db:migrate
   ```

### Option 2: Bare-Metal Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Environment Variables:**
   Ensure local Postgres and Redis instances are running. Copy `.env.example` to `.env` and configure your credentials.

3. **Run database migrations:**
   ```bash
   npm run db:migrate
   ```

4. **Start the API and Worker (in separate terminals):**
   ```bash
   npm run dev          # Terminal 1: Starts API on port 3000
   npm run worker:dev   # Terminal 2: Starts BullMQ worker
   ```

---

## Environment Variables

Here are the critical environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_URL` / `POSTGRES_USER` | Postgres connection credentials | - |
| `REDIS_URL` | Redis connection URL | - |
| `ENCRYPTION_KEY_V1` | **Required.** 64-character hex string for AES-256-GCM encryption of endpoint secrets | - |
| `WEBHOOK_MAX_FAILURES` | Number of consecutive delivery failures before an endpoint is auto-disabled | `5` |
| `RETRY_MAX_ATTEMPTS` | Max HTTP retry attempts per delivery | `5` |
| `WEBHOOK_TIMEOUT_MS` | Max time (ms) to wait for a consumer to respond to a webhook request | `10000` |
| `WEBHOOK_RATE_LIMIT` | Requests allowed per time window per endpoint | `10` |

---

## Integration Guide (Publisher Flow)

This guide explains how to use the Hooks API to register consumers, set up webhook endpoints, and publish events. All endpoints require an API Key.

### 1. Generate an API Key
Generate an API key to authenticate your requests against the Hooks service.
```bash
docker compose exec app npm run api:generate-key
# Store the returned key securely!
```

### 2. Create a Consumer
A Consumer represents an external system, app, or user subscribing to webhooks.
```bash
curl -X POST http://localhost:3000/consumers \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Client App"}'
```

### 3. Create an Endpoint
Register the URL where the Consumer will receive webhook POST requests. The response includes a `secret` which you must securely share with the Consumer.
```bash
# Replace :consumerId with the actual Consumer ID (e.g., 1)
curl -X POST http://localhost:3000/consumers/1/endpoints \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Production Webhook URL", "url": "https://client-app.com/webhook"}'
```

### 4. Trigger an Event
Trigger an event. Hooks automatically resolves the active endpoints for the Consumer and enqueues delivery jobs.
```bash
curl -X POST http://localhost:3000/events \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "consumerID": 1,
    "eventData": {
      "timestamp": 1695729384,
      "type": "user.created",
      "data": { "userId": 123, "email": "test@example.com" }
    }
  }'
```

---

## Integration Guide (Subscriber Flow)

When Hooks delivers a webhook to the Consumer's URL, it signs the request using the endpoint's unique secret.

**Webhook Headers:**
- `content-type`: `application/json`
- `event-id`: The unique ID of the event.
- `webhook-timestamp`: The Unix timestamp when the request was initiated.
- `webhook-signature`: The HMAC-SHA256 signature, formatted as `v1,<base64-signature>`.

### Verifying the Signature (Node.js Example)
Consumers must verify incoming webhooks to prevent replay attacks and tampering:

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(req, endpointSecret) {
  const eventId = req.headers['event-id'];
  const timestamp = req.headers['webhook-timestamp'];
  const signatureHeader = req.headers['webhook-signature']; // e.g., "v1,Base64Hash="
  
  // 1. Prevent Replay Attacks (Reject if > 5 minutes old)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (currentTimestamp - parseInt(timestamp, 10) > 300) {
    throw new Error('Webhook timestamp is too old');
  }

  // 2. Extract the base64 signature
  const [version, digest] = signatureHeader.split(',');
  if (version !== 'v1') throw new Error('Unsupported signature version');

  // 3. Reconstruct the signed payload exactly as it was transmitted
  const rawBody = JSON.stringify(req.body); 
  const signedContent = `${eventId}.${timestamp}.${rawBody}`;

  // 4. Compute the expected signature
  const expectedDigest = crypto
    .createHmac('sha256', endpointSecret)
    .update(signedContent)
    .digest('base64');

  // 5. Securely compare signatures
  const isValid = crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(expectedDigest)
  );

  if (!isValid) throw new Error('Invalid webhook signature');
  return true;
}
```

---

## API Reference & OpenAPI Swagger UI

All requests to the API must include the header `x-api-key: <API_KEY>`.

### 📖 Interactive Swagger UI (Open PR Branch)
If you check out the pending OpenAPI PR branch (`feature/SCRUM-26-api-reference-openapi`), you can explore and test the API directly through a beautiful interactive Swagger UI.

1. Checkout the branch:
   ```bash
   git checkout feature/SCRUM-26-api-reference-openapi
   ```
2. Start the server (e.g., `npm run dev`)
3. Visit the interactive documentation at: **`http://localhost:3000/docs`**

---

### Core Endpoints Overview

#### Consumers
- `POST /consumers` - Create a consumer (`{ "name": "..." }`)
- `GET /consumers` - List consumers
- `PATCH /consumers/:id` - Update consumer
- `DELETE /consumers/:id` - Soft delete consumer

#### Endpoints
- `POST /consumers/:consumerId/endpoints` - Create endpoint (Returns the encrypted `secret`)
- `GET /consumers/:consumerId/endpoints` - List endpoints (Supports `?includeInactive=true`)
- `PATCH /consumers/:consumerId/endpoints/:id` - Update endpoint URL or label
- `DELETE /consumers/:consumerId/endpoints/:id` - Soft delete endpoint
- `POST /consumers/:consumerId/endpoints/:id/restore` - Restore a deleted endpoint

#### Events
- `POST /events` - Trigger a new event
- `GET /events/:eventId` - Get event details and delivery status summary (`pending`, `success`, `failed`)

---

## License

This project is licensed under the ISC License.
