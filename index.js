const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// ================== MIDDLEWARE ==================
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://medical-camp-project.vercel.app'
    ],
    credentials: true,
    optionSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Preflight রিকোয়েস্ট হ্যান্ডেল করার জন্য (CORS Error ফিক্স)
app.options('*', cors(corsOptions));

// ================== MONGODB CONNECTION ==================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@hobbyhub-cluster.r05fdg3.mongodb.net/?retryWrites=true&w=majority&appName=hobbyhub-cluster`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const db = client.db("medicalCampDB");
        const campCollection = db.collection("camps");
        const registeredCollection = db.collection("registeredCamps");
        const usersCollection = db.collection("users");
        const paymentCollection = db.collection("payments");

        console.log("✅ MongoDB Connected Successfully!");

        // --- API Routes (আপনার আগের সব রুট এখানে থাকবে) ---
        
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send({ role: user?.role || 'participant' });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) return res.send({ message: 'User already exists', insertedId: null });
            const result = await usersCollection.insertOne({ ...user, role: 'participant' });
            res.send(result);
        });

        app.get('/camps', async (req, res) => {
            const result = await campCollection.find().toArray();
            res.send(result);
        });

        // (বাকি সব রুটগুলো এখানে ঠিকঠাক আছে...)

    } catch (error) {
        console.error("❌ DB Error:", error);
    }
}
run().catch(console.dir);

// Root Route
app.get('/', (req, res) => {
    res.send('Medical Camp Server is Running!');
});

// Vercel এর জন্য app.listen ঠিক করা হলো
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`🚀 Server listening on port: ${port}`);
    });
}

module.exports = app;