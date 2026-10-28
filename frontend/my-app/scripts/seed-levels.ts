
import "dotenv/config";
import { MongoClient } from "mongodb";
import { levels } from "../data/levels";

async function seedLevels() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    throw new Error("Set MONGODB_URI and MONGODB_DB in your environment.");
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection("levels");

    await collection.createIndex({ id: 1 }, { unique: true });

    for (const level of levels) {
      await collection.updateOne(
        { id: level.id },
        {
          $set: {
            ...level,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    console.log(`Seeded ${levels.length} levels.`);
  } finally {
    await client.close();
  }
}

seedLevels().catch((error) => {
  console.error("Failed to seed levels:", error);
  process.exitCode = 1;
});
