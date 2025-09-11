// server.js (UPDATED FOR CLOUDFLARE WORKER)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
// const nodemailer = require('nodemailer'); // REMOVE THIS LINE

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// --- REMOVE NODEMAILER TRANSPORTER SETUP ---
// const transporter = nodemailer.createTransport({ ... });
// transporter.verify( ... );
// --- END REMOVAL ---

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration (no change)
let allowedOrigins = [];
if (process.env.FRONTEND_URL) {
  allowedOrigins = process.env.FRONTEND_URL.split(",").map((url) => url.trim());
} else {
  allowedOrigins = ["http://localhost:3001"];
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS: Origin '${origin}' not allowed.`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

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
    console.warn("Bot detected via honeypot field!");
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
    const savedMessage = result.rows[0];
    console.log("Saved contact message:", savedMessage);

    // --- CALL CLOUDFLARE EMAIL WORKER HERE ---
    const emailWorkerURL = process.env.EMAIL_WORKER_URL;
    if (emailWorkerURL) {
      try {
        const workerResponse = await fetch(emailWorkerURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // You could add an internal API key here for even more security between Droplet and Worker
          },
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            submitted_at: savedMessage.submitted_at,
          }),
        });

        if (workerResponse.ok) {
          console.log(
            "Email Worker notification triggered successfully:",
            await workerResponse.text()
          );
        } else {
          const errorText = await workerResponse.text();
          console.error(
            "Email Worker responded with error:",
            workerResponse.status,
            errorText
          );
        }
      } catch (workerError) {
        console.error("Failed to call Email Worker:", workerError);
      }
    } else {
      console.warn("EMAIL_WORKER_URL is not set. Skipping email notification.");
    }
    // --- END WORKER CALL ---

    res.status(201).json({
      message: "Contact form submitted successfully!",
      data: savedMessage,
    });
  } catch (err) {
    console.error(
      "Error saving contact message or calling email worker:",
      err.message
    );
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
