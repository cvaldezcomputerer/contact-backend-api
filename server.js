// server.js
require("dotenv").config(); // Load environment variables from .env file

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg"); // Import Pool from 'pg' library

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: Add SSL configuration for production, if your DB requires it (DigitalOcean's does for managed DBs)
  // ssl: {
  //   rejectUnauthorized: false // Be cautious with this in production, better to provide CA cert
  // }
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Middleware
app.use(express.json()); // To parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded request bodies

// Configure CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3001",
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Basic route for testing server
app.get("/", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()"); // Simple query to test DB connection
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

// Contact Form POST route
app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  // Basic Validation (you'd want more robust validation in production)
  if (!name || !email || !message) {
    return res
      .status(400)
      .json({ error: "Name, email, and message are required." });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      "INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3) RETURNING *",
      [name, email, message]
    );
    client.release();
    console.log("Saved contact message:", result.rows[0]);
    res
      .status(201)
      .json({
        message: "Contact form submitted successfully!",
        data: result.rows[0],
      });
  } catch (err) {
    console.error("Error saving contact message:", err.message);
    res.status(500).json({ error: "Failed to submit contact form." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Database URL: ${process.env.DATABASE_URL}`);
});
