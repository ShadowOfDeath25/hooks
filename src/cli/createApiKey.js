import {generateApiKey} from "../services/apiKeyService.js";
import {ApiKeyLimitError} from "../errors/ApiLimitKeyError.js";
import chalk from "chalk";

async function main() {
    const label = process.argv[2];

    if (!label) {
       console.error(chalk.red("Missing required argument: label"));
       console.log(chalk.bold("Usage: npm run api:generate-key -- <label>"));
       process.exit(1);
    }
    const {fullKey, keyHash} = await generateApiKey(label);
    console.warn(chalk.yellow.bold("Warning: The API key will not be accessible after this point. Please store it securely."));
    console.log(chalk.green("Generated API Key:"), fullKey);
    console.log(chalk.green("API Key Hash:"), keyHash);
    process.exit(0);
}

await main().catch((err) => {
    if (err instanceof ApiKeyLimitError) {
        console.error(chalk.red(`${err.message}`));
    } else {
        console.error(chalk.red("Something went wrong:"), err.message);
    }
    process.exit(1);
});