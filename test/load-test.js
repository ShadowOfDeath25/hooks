import 'dotenv/config';
import autocannon from 'autocannon';

process.loadEnvFile();

const targetUrl = process.env.TARGET_URL ?? 'http://localhost:3000/events';
const apiKey = process.env.API_KEY;
const consumerIds = (process.env.CONSUMER_IDS ?? '')
	.split(',')
	.map((value) => Number.parseInt(value.trim(), 10))
	.filter((value) => Number.isInteger(value) && value > 0);

if (!apiKey) {
	throw new Error('API_KEY is required');
}

if (consumerIds.length === 0) {
	throw new Error('CONSUMER_IDS must contain one or more positive integer IDs');
}

function getPositiveInteger(name, fallback) {
	const value = Number.parseInt(process.env[name] ?? fallback, 10);

	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer`);
	}

	return value;
}

const connections = getPositiveInteger('CONNECTIONS', 1);
const duration = getPositiveInteger('DURATION', 5);
const pipelining = getPositiveInteger('PIPELINING', 1);
let requestNumber = 0;

const instance = autocannon({
	url: targetUrl,
	connections,
	duration,
	pipelining,
	method: 'POST',
	headers: {
		'x-api-key': apiKey,
		'content-type': 'application/json'
	},
    body: JSON.stringify({
        "consumerID": "8",
        "eventData": {
            "timestamp": "1788390809",
            "type": "job.test",
            "data": {
                "message": "hello!"
            }
        }
    }),
	setupRequest(request) {
        console.log(`Setting up request number ${requestNumber}`);
		const sequence = requestNumber++;
		const consumerID = consumerIds[sequence % consumerIds.length];
		request.body = JSON.stringify({
			consumerID,
			eventData: {
				timestamp: Date.now(),
				type: process.env.EVENT_TYPE ?? 'load.test',
				data: {
					source: 'autocannon',
					sequence,
					consumerID
				}
			}
		});
        request.headers['content-length'] = Buffer.byteLength(request.body);
        console.error(`Request body length: ${request.headers['content-length']}`);
		return request;
	}
}, (error, result) => {
	if (error) {
		console.error(error);
		process.exitCode = 1;
		return;
	}

	console.log({
		requests: result.requests.total,
		non2xx: result.non2xx,
		errors: result.errors,
		timeouts: result.timeouts
	});
});

autocannon.track(instance, { renderProgressBar: true });
