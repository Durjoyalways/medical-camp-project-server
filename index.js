const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// ================== MIDDLEWARE ==================
app.use(cors({
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174' // আপনার বর্তমান ফ্রন্টএন্ড পোর্ট
    ],
    credentials: true
}));
app.use(express.json());

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
    // Database and Collections
    const db = client.db("medicalCampDB");
    const campCollection = db.collection("camps");
    const registeredCollection = db.collection("registeredCamps");
    const usersCollection = db.collection("users");
    const paymentCollection = db.collection("payments");

    console.log("✅ MongoDB Connected Successfully!");

    // ================== USERS & ROLE API ==================

    // ১. ইউজারের রোল চেক করা (DashboardLayout এর জন্য অত্যন্ত গুরুত্বপূর্ণ)
    app.get('/users/role/:email', async (req, res) => {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        // ডাটাবেসে যা আছে তাই পাঠাবে, না থাকলে 'participant'
        res.send({ role: user?.role || 'participant' });
    });

    // ২. এডমিন/অর্গানাইজার স্ট্যাটাস চেক (Boolean format এ)
    app.get('/users/admin/:email', async (req, res) => {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        const isAdmin = user?.role === 'organizer';
        res.send({ admin: isAdmin });
    });

    // ৩. নতুন ইউজার সেভ করা
    app.post('/users', async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
            return res.send({ message: 'User already exists', insertedId: null });
        }
        // নতুন ইউজার সাইন-আপ করলে ডিফল্ট রোল 'participant'
        const result = await usersCollection.insertOne({ ...user, role: 'participant' });
        res.send(result);
    });

    // ================== MEDICAL CAMPS API ==================

    // ৪. পপুলার ক্যাম্প (Home Page এর জন্য)
    app.get('/popular-camps', async (req, res) => {
        const result = await campCollection.find()
            .sort({ participantCount: -1 })
            .limit(6)
            .toArray();
        res.send(result);
    });

    // ৫. সব ক্যাম্প
    app.get('/camps', async (req, res) => {
        const result = await campCollection.find().toArray();
        res.send(result);
    });


// ১. নির্দিষ্ট ইউজারের রেজিস্ট্রেশন করা ক্যাম্পগুলো খুঁজে বের করা
app.get('/registeredcamps/:email', async (req, res) => {
    const email = req.params.email;
    const query = { participantEmail: email }; // আপনার ডাটাবেসে ইমেইল ফিল্ডের নাম নিশ্চিত করুন
    const result = await registeredCollection.find(query).toArray();
    res.send(result);
});

// ২. রেজিস্ট্রেশন ক্যানসেল/ডিলিট করা
app.get('/registeredcamps/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    
    // ডিলিট করার আগে ঐ রেজিস্ট্রেশনের ডাটা নিয়ে আসা (participantCount কমানোর জন্য)
    const registration = await registeredCollection.findOne(query);
    
    const result = await registeredCollection.deleteOne(query);
    
    if (result.deletedCount > 0 && registration) {
        // ক্যাম্পের পার্টিসিপেন্ট সংখ্যা ১ কমিয়ে দেওয়া
        const filter = { _id: new ObjectId(registration.campId) };
        await campCollection.updateOne(filter, { $inc: { participantCount: -1 } });
    }
    
    res.send(result);
});


// পেমেন্টের জন্য নির্দিষ্ট আইডি দিয়ে রেজিস্ট্রেশন ডাটা নিয়ে আসা
app.get('/registeredcamps/id/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const query = { _id: new ObjectId(id) };
        const result = await registeredCollection.findOne(query);
        
        if (!result) {
            return res.status(404).send({ message: "Registration not found" });
        }
        
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Invalid ID format or server error" });
    }
});

// পেমেন্ট সাকসেস হওয়ার পর স্ট্যাটাস আপডেট করার রুট (CheckoutForm এর জন্য লাগবে)
app.patch('/payments-success/:id', async (req, res) => {
    const id = req.params.id;
    const paymentData = req.body;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            paymentStatus: 'Paid',
            confirmationStatus: 'Confirmed',
            transactionId: paymentData.transactionId
        },
    };
    const result = await registeredCollection.updateOne(filter, updateDoc);
    res.send(result);
});

// ১. পেমেন্ট সম্পন্ন হলে নতুন রেকর্ড সেভ করা (এটি আপনার CheckoutForm থেকে কল হবে)
app.post('/payments', async (req, res) => {
    const payment = req.body;
    const result = await paymentCollection.insertOne(payment);
    res.send(result);
});

// ২. নির্দিষ্ট ইউজারের ইমেইল অনুযায়ী পেমেন্ট হিস্ট্রি খুঁজে বের করা
app.get('/payment-history/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email: email };
    
    // সর্বশেষ পেমেন্টগুলো আগে দেখানোর জন্য সর্টিং করা হয়েছে
    const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
    res.send(result);
});




    // ৬. নির্দিষ্ট ক্যাম্প ডিটেইলস
    app.get('/camps/:id', async (req, res) => {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
        const result = await campCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
    });

    // ৭. নতুন ক্যাম্প যোগ করা (Organizer Only)
    app.post('/camps', async (req, res) => {
        const camp = req.body;
        const result = await campCollection.insertOne(camp);
        res.send(result);
    });

    // ================== REGISTRATION & PAYMENT ==================

    app.post('/registered-camps', async (req, res) => {
        const registration = req.body;
        const result = await registeredCollection.insertOne(registration);
        
        // ক্যাম্পের পার্টিসিপেন্ট সংখ্যা বাড়ানো
        const filter = { _id: new ObjectId(registration.campId) };
        await campCollection.updateOne(filter, { $inc: { participantCount: 1 } });
        
        res.send(result);
    });

    // Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
        const { price } = req.body;
        if (!price || price < 1) return res.status(400).send({ message: "Invalid Price" });
        const amount = Math.round(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            payment_method_types: ['card'],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
    });

  } catch (error) {
    console.error("❌ DB Error:", error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => res.send('Medical Camp Server is Running!'));

app.listen(port, () => {
    console.log(`🚀 Server listening on port: ${port}`);
});