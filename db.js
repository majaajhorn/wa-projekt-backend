import { MongoClient } from "mongodb";

// majhorn - zI4w97wI0YlduWy1
const uri = 'mongodb+srv://majhorn:zI4w97wI0YlduWy1@carematch.uw8jk.mongodb.net/?retryWrites=true&w=majority&appName=CareMatch';
const client = new MongoClient(uri);

let db;

export const connectDB = async () => {
    if (!db) {
        await client.connect();
        db = client.db('CareMatch');
    }
    return db;
}

