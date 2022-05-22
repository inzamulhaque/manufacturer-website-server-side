const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require("jsonwebtoken");
require("dotenv").config();
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
        const userCollection = client.db("ih_electronics").collection("users");
        const profileCollection = client.db("ih_electronics").collection("profile");

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