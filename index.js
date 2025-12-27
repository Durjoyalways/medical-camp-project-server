const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
    const paymentCollection = db.collection("payments");

    // ==========================================================
    // ১. পেমেন্টের জন্য ডাটা খুঁজে বের করা (ID ভিত্তিক)
    // ==========================================================
    // রুট পরিবর্তন: /registeredcamps/id/:id
    app.get('/registeredcamps/id/:id', async (req, res) => {
      try {
        const id = req.params.id.trim();
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await registeredCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Registration not found" });
        }

        // ফি না থাকলে মেইন ক্যাম্প থেকে নিয়ে আসা
        if (!result.fees) {
          const mainCamp = await campCollection.findOne({ _id: new ObjectId(result.campId) });
          result.fees = mainCamp?.fees || mainCamp?.campFees || 0;
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server Error", error });
      }
    });

    // Stripe Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      if (!price || price < 1) return res.status(400).send({ message: "Invalid Price" });

      const amount = Math.round(parseFloat(price) * 100);
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // পেমেন্ট তথ্য সেভ করা
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      try {
        const paymentResult = await paymentCollection.insertOne(payment);

        const filter = { _id: new ObjectId(payment.registrationId) };
        const updatedDoc = {
          $set: {
            paymentStatus: 'Paid',
            transactionId: payment.transactionId,
            confirmationStatus: 'Confirmed'
          }
        };
        const updateResult = await registeredCollection.updateOne(filter, updatedDoc);

        res.send({ paymentResult, updateResult });
      } catch (error) {
        res.status(500).send(error);
      }
    });

    // ==========================================================
    // ২. ইমেইল অনুযায়ী ডাটা গেট এবং ডিলিট
    // ==========================================================
    
    // রুট পরিবর্তন: /registeredcamps/:email
    app.get('/registeredCamps/:email', async (req, res) => {
      const email = req.params.email;
      const result = await registeredCollection.find({ participantEmail: email }).toArray();
      res.send(result);
    });

    // রুট পরিবর্তন: /registeredcamps/:id
    app.delete('/registeredCamps/:id', async (req, res) => {
      const id = req.params.id;
      const result = await registeredCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // ক্যাম্প গেট রুট
    app.get('/camps', async (req, res) => {
      const result = await campCollection.find().toArray();
      res.send(result);
    });

    console.log("Connected to MongoDB & Ready for Payments!");
  } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Medical Camp Server Running'));
app.listen(port, () => console.log(`Server is running on port: ${port}`));