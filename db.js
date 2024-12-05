import { MongoClient } from "mongodb";
import dotenv from 'dotenv';


dotenv.config();
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

export const connectDB = async () => {
    if (!db) {
        await client.connect();
        db = client.db('CareMatch');
    }
    return db;
}

