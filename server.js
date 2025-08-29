// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- IMPORTANT: Updated CORS Configuration ---
let allowedOrigins = [];
if (process.env.FRONTEND_URL) {
  allowedOrigins = process.env.FRONTEND_URL.split(",").map((url) => url.trim());
} else {
  // Fallback for local dev if FRONTEND_URL is not set
  allowedOrigins = ["http://localhost:3001"];
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    // or requests from the allowedOrigins list
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
// --- End Updated CORS Configuration ---

app.get("/", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    client.release();
    res
      .status(200)
      .send(`Contact Backend API is running! DB Time: ${result.rows[0].now}`);
  } catch (err) {
    console.error("Database connection error on GET /:", err.message);
    res
      .status(500)
      .send("Contact Backend API is running, but database connection failed.");
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message, trap } = req.body;

  if (trap) {
    return res.status(400).json({ error: "Form submission blocked." });
  }

  if (!name || !email || !subject || !message) {
    return res
      .status(400)
      .json({ error: "Name, email, subject, and message are required." });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      "INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, email, subject, message]
    );
    client.release();
    console.log("Saved contact message:", result.rows[0]);
    res.status(201).json({
      message: "Contact form submitted successfully!",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error saving contact message:", err.message);
    res.status(500).json({ error: "Failed to submit contact form." });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Database URL: ${process.env.DATABASE_URL}`);
  if (process.env.FRONTEND_URL) {
    console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
  }
});
