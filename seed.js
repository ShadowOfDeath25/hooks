import { db } from './src/db/index.js';
import { consumers } from './src/db/schema/consumers.js';

async function seedConsumer() {
    try {
        console.log('🌱 Seeding a dummy consumer into the database...');
        
        const [newConsumer] = await db.insert(consumers).values({
            name: "Test Consumer Company"
        }).returning();

        console.log('✅ Success! Consumer created.');
        console.log('---------------------------------');
        console.log(`Your consumerId is: ${newConsumer.id}`);
        console.log('---------------------------------');
        console.log('You can now use this ID to test the POST /endpoints route!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to seed consumer:', error);
        process.exit(1);
    }
}

seedConsumer();
