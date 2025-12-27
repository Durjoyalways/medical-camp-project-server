const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI (.env থেকে ইউজার এবং পাসওয়ার্ড নিচ্ছে)
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@hobbyhub-cluster.r05fdg3.mongodb.net/?retryWrites=true&w=majority&appName=hobbyhub-cluster`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    const db = client.db("medicalCampDB");
    const campCollection = db.collection("camps");
    const registeredCollection = db.collection("registeredCamps");
    const userCollection = db.collection("users");

    // --- User & Role APIs ---

    // ১. ইউজার সেভ করা (অটোমেটিক অর্গানাইজার রোল অ্যাসাইন করা)
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }

      // স্পেশাল কন্ডিশন: এই ইমেইলটি অর্গানাইজার হবে
      if (user.email === "td16122019@gmail.com") {
        user.role = 'organizer';
      } else {
        user.role = 'participant';
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // ২. রোল চেক করা
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send({ role: user?.role || 'participant' });
    });

    // --- Camp APIs ---

    app.get('/popular-camps', async (req, res) => {
      const result = await campCollection
        .find()
        .sort({ participantCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get('/camps', async (req, res) => {
      const result = await campCollection.find().toArray();
      res.send(result);
    });

    app.get('/camps/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.findOne(query);
      res.send(result);
    });

    app.post('/camps', async (req, res) => {
      const campData = req.body;
      if (!campData.participantCount) campData.participantCount = 0;
      const result = await campCollection.insertOne(campData);
      res.send(result);
    });

    // --- Registration & Management ---

    app.get('/registered-camps/:email', async (req, res) => {
      const email = req.params.email;
      const query = { participantEmail: email };
      const result = await registeredCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/registered-camps', async (req, res) => {
      const result = await registeredCollection.find().toArray();
      res.send(result);
    });

    app.post('/registered-camps', async (req, res) => {
      const registrationData = req.body;
      const result = await registeredCollection.insertOne(registrationData);

      const filter = { _id: new ObjectId(registrationData.campId) };
      const updateDoc = { $inc: { participantCount: 1 } };
      await campCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    app.patch('/registered-camps/:id', async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updateDoc = { $set: { confirmationStatus: 'Confirmed' } };
      const result = await registeredCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete('/registered-camps/:id', async (req, res) => {
      const id = req.params.id;
      const registration = await registeredCollection.findOne({ _id: new ObjectId(id) });
      
      if (registration) {
        const campFilter = { _id: new ObjectId(registration.campId) };
        await campCollection.updateOne(campFilter, { $inc: { participantCount: -1 } });
      }

      const result = await registeredCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    console.log("Successfully connected to MongoDB Atlas!");
  } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Medical Camp Server is Running'));
app.listen(port, () => console.log(`Server is running on port: ${port}`));