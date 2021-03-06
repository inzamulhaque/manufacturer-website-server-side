const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_KEY);
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// contect mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ftcfo.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
    const authHeaders = req.headers.authorization;
    if (!authHeaders) {
        return res.status(401).send({ message: "unauthorized access" });
    }

    const getToken = authHeaders.split(" ")[1];

    jwt.verify(getToken, process.env.TOKEN_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();

        // add collections
        const userCollection = client.db("ih_electronics").collection("users");
        const itemCollection = client.db("ih_electronics").collection("items");
        const profileCollection = client.db("ih_electronics").collection("profile");
        const orderCollection = client.db("ih_electronics").collection("orders");
        const reviewCollection = client.db("ih_electronics").collection("reviews");
        const paymentCollection = client.db("ih_electronics").collection("payment");

        // admin verify
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === "admin") {
                next();
            } else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // create new user and set default role
        app.post("/user/:email", async (req, res) => {
            const { email } = req.params;
            const user = req.body;
            const filter = { email };

            const findUser = await userCollection.findOne(filter);
            if (!findUser) {
                await userCollection.insertOne(user);
            }
            const token = jwt.sign({ email }, process.env.TOKEN_KEY, { expiresIn: '10h' });
            res.send({ token });
        });

        // get one user
        app.get("/user/:email", verifyJWT, async (req, res) => {
            const { email } = req.params;
            const result = await userCollection.findOne({ email });
            res.send(result);
        });

        // set and update user profile
        app.put("/profile/:email", verifyJWT, async (req, res) => {
            const { email } = req.params;
            const user = req.body;
            const filter = { email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: { email, ...user }
            };
            const result = await profileCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        // get profile info
        app.get("/profile/:email", verifyJWT, async (req, res) => {
            const { email } = req.params;
            const result = await profileCollection.findOne({ email });
            res.send(result);
        });

        // get admin
        app.get("/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email });
            res.send(user);
        });

        // add new item
        app.post("/additem", verifyJWT, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await itemCollection.insertOne(item);
            res.send(result);
        });

        // get item for home page
        app.get("/homeitem", async (req, res) => {
            const itemLimit = parseInt(req.query.limit);
            const cursor = itemCollection.find().sort({ _id: -1 }).limit(itemLimit);
            const result = await cursor.toArray();
            res.send(result);
        });

        // get all item
        app.get("/item", async (req, res) => {
            const cursor = itemCollection.find().sort({ _id: -1 });
            const result = await cursor.toArray();
            res.send(result);
        });

        // get item by id
        app.get("/item/:id", verifyJWT, async (req, res) => {
            const { id } = req.params;
            const query = { _id: ObjectId(id) };
            const result = await itemCollection.findOne(query);
            res.send(result);
        });

        app.get("/readmore/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: ObjectId(id) };
            const result = await itemCollection.findOne(query);
            res.send(result);
        });

        // update item
        app.patch("/item/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const newData = req.body;
            const { id } = req.params;
            const filter = { _id: ObjectId(id) };
            const updatedDocs = {
                $set: newData
            };
            const result = await itemCollection.updateOne(filter, updatedDocs);
            res.send(result);
        });

        // delete item
        app.delete("/item/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const result = await itemCollection.deleteOne({ _id: ObjectId(id) });
            res.send(result);
        });

        // get item for stock summary
        app.get("/stocksummary", async (req, res) => {
            const cursor = itemCollection.find().sort({ availableQty: -1 }).limit(5);
            const result = await cursor.toArray();
            res.send(result);
        });

        // add new order
        app.post("/order", verifyJWT, async (req, res) => {
            const order = req.body;
            const itemId = order.itemId;
            const item = await itemCollection.findOne({ _id: ObjectId(itemId) })
            const newQty = parseInt(item.availableQty) - parseInt(order.qty);
            const result = await orderCollection.insertOne(order);
            await itemCollection.updateOne({ _id: ObjectId(itemId) }, { $set: { availableQty: newQty } });

            res.send(result);
        });

        // get order
        app.get("/order/:id", verifyJWT, async (req, res) => {
            const { id } = req.params;
            const result = await orderCollection.findOne({ _id: ObjectId(id) });
            res.send(result);
        });

        // get order for one user
        app.get("/order", verifyJWT, async (req, res) => {
            const email = req.decoded.email;
            const result = await orderCollection.find({ email }).sort({ _id: -1 }).toArray();
            res.send(result);
        });

        app.get("/allOrders", verifyJWT, async (req, res) => {
            const result = await orderCollection.find().sort({ _id: -1 }).toArray();
            res.send(result);
        });

        // delete order
        app.delete("/order", verifyJWT, async (req, res) => {
            const { id, itemId } = req.query;
            const qty = parseInt(req.query.qty);
            const email = req.decoded.email;
            const item = await itemCollection.findOne({ _id: ObjectId(itemId) });
            const newQty = parseInt(item.availableQty) + qty;
            await itemCollection.updateOne({ _id: ObjectId(itemId) }, { $set: { availableQty: newQty } });
            const result = await orderCollection.deleteOne({ _id: ObjectId(id), email, paid: false });
            res.send(result);
        });

        // updated order
        app.patch("/order/:id", verifyJWT, async (req, res) => {
            const { id } = req.params;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    status: "pending",
                    transactionId: payment.transactionId
                }
            };
            const updateOrder = await orderCollection.updateOne(filter, updatedDoc);
            await paymentCollection.insertOne(payment);

            res.send(updateOrder);
        });

        app.patch("/shipped/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: "shipped"
                }
            };
            const updateOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updateOrder);
        });

        // add new rivew
        app.post("/review", verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        // get user review for show user
        app.get("/review/:email", verifyJWT, async (req, res) => {
            const { email } = req.params;
            const cursor = reviewCollection.find({ email }).sort({ _id: -1 });
            const result = await cursor.toArray();
            res.send(result);
        });

        // get reviews for home page
        app.get("/reviews", async (req, res) => {
            const cursor = reviewCollection.find().sort({ _id: -1 }).limit(9);
            const result = await cursor.toArray();
            res.send(result);
        });

        // get all user
        app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // make admin
        app.patch("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const result = await userCollection.updateOne({ _id: ObjectId(id) }, { $set: { role: "admin" } });
            res.send(result);
        });

        // create-payment-intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const order = req.body;
            const totalCost = parseFloat(order?.totalCost);
            if (totalCost) {
                const amount = totalCost * 100;

                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: "usd",
                    payment_method_types: ["card"]
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            }
        });

    } finally {

    }
}

run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("SERVER RUNNING");
});

app.listen(port, () => {
    console.log(`http://localhost:${port}`);
});