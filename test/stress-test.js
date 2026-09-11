// test/stress-test.js
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import autocannon from 'autocannon';

const targetUrl = process.env.TARGET_URL ?? 'http://localhost:3000/events/';
const apiKey = process.env.API_KEY;
const bodyPath = process.env.BODY_PATH ?? path.join('test', 'test-body.json');

if (!apiKey) {
	throw new Error('API_KEY is required (set it in .env)');
}

let body;
try {
	body = readFileSync(bodyPath, 'utf-8');
	JSON.parse(body); // fail fast if the fixture isn't valid JSON
} catch (err) {
	throw new Error(`Could not read/parse body file at "${bodyPath}": ${err.message}`);
}

function getPositiveInteger(name, fallback) {
	const value = Number.parseInt(process.env[name] ?? fallback, 10);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

const connections = getPositiveInteger('CONNECTIONS', 10);
const duration = getPositiveInteger('DURATION', 30);
const pipelining = getPositiveInteger('PIPELINING', 1);

const instance = autocannon(
	{
		url: targetUrl,
		connections,
		duration,
		pipelining,
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			'content-type': 'application/json',
		},
		body, // static body — autocannon computes content-length correctly on its own
	},
	(error, result) => {
		if (error) {
			console.error(error);
			process.exitCode = 1;
			return;
		}

		const summary = {
			startedAt: new Date(result.start).toISOString(),
			finishedAt: new Date(result.finish).toISOString(),
			durationSec: duration,
			connections,
			pipelining,
			requests: {
				total: result.requests.total,
				average: result.requests.average,
			},
			latencyMs: {
				p50: result.latency.p50,
				p90: result.latency.p90,
				p97_5: result.latency.p97_5,
				p99: result.latency.p99,
				max: result.latency.max,
			},
			throughputBytesPerSec: result.throughput.average,
			non2xx: result.non2xx,
			errors: result.errors,
			timeouts: result.timeouts,
		};

		console.log(summary);

		mkdirSync('results', { recursive: true });
		const outFile = path.join('results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		writeFileSync(outFile, JSON.stringify(result, null, 2));
		console.log(`Full result saved to ${outFile}`);

		// simple pass/fail gate — tune or remove as needed
		const errorRate = result.non2xx / result.requests.total;
		if (errorRate > 0.01) {
			console.error(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds 1% threshold`);
			process.exitCode = 1;
		}
	}
);

autocannon.track(instance, { renderProgressBar: true });

process.once('SIGINT', () => {
	instance.stop();
});