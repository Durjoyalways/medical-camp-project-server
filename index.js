const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@hobbyhub-cluster.r05fdg3.mongodb.net/?retryWrites=true&w=majority&appName=hobbyhub-cluster`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    // ডাটাবেজ কানেকশন
    const db = client.db("medicalCampDB");
    const campCollection = db.collection("camps");
    const registeredCollection = db.collection("registeredCamps");

    // --- Popular Camps API ---
    // সর্ট করে টপ ৬টি জনপ্রিয় ক্যাম্প পাওয়ার জন্য
    app.get('/popular-camps', async (req, res) => {
      const result = await campCollection
        .find()
        .sort({ participantCount: -1 }) // সর্বোচ্চ পার্টিসিপেন্ট আগে আসবে
        .limit(6)
        .toArray();
      res.send(result);
    });

    // --- Camp APIs ---
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
      // নতুন ক্যাম্প অ্যাড করার সময় কাউন্ট ০ সেট করা
      if(!campData.participantCount) campData.participantCount = 0;
      const result = await campCollection.insertOne(campData);
      res.send(result);
    });

    app.delete('/camps/:id', async (req, res) => {
      const result = await campCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // --- Registration APIs ---

    app.get('/registered-camps', async (req, res) => {
      const result = await registeredCollection.find().toArray();
      res.send(result);
    });

    // রেজিস্ট্রেশন সেভ করা + পার্টিসিপেন্ট কাউন্ট ১ বাড়ানো
    app.post('/registered-camps', async (req, res) => {
      const registrationData = req.body;
      
      // ১. রেজিস্ট্রেশন সেভ করা
      const result = await registeredCollection.insertOne(registrationData);

      // ২. ওই নির্দিষ্ট ক্যাম্পের participantCount ১ বৃদ্ধি করা
      const campId = registrationData.campId;
      const filter = { _id: new ObjectId(campId) };
      const updateDoc = {
        $inc: { participantCount: 1 } // ডাটাবেজে সরাসরি ১ যোগ হবে
      };
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
      const result = await registeredCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    console.log("Database connected and APIs ready!");
  } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Medical Camp Server is Running'));
app.listen(port, () => console.log(`Server is running on port: ${port}`));