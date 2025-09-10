// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const nodemailer = require("nodemailer"); // ADD THIS LINE

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// --- ADD NODEMAILER TRANSPORTER SETUP HERE ---
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587", 10),
  secure: process.env.EMAIL_SECURE === "true", // Use `true` if port 465, `false` if port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify Nodemailer transporter connection (optional, good for debugging)
transporter.verify(function (error, success) {
  if (error) {
    console.error("Nodemailer transporter connection failed:", error);
  } else {
    console.log("Nodemailer transporter ready to send mail.");
  }
});
// --- END NODEMAILER TRANSPORTER SETUP ---

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
    if (!origin || allowedOrigins.includes(origin)) {
      // Corrected from indexOf for consistency
      callback(null, true);
    } else {
      console.warn(`CORS: Origin '${origin}' not allowed.`);
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

  // Honeypot Check (no change)
  if (trap) {
    console.warn("Bot detected via honeypot field!");
    return res.status(400).json({ error: "Form submission blocked." });
  }

  // Basic Validation (no change)
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
    const savedMessage = result.rows[0]; // Store the returned row for email
    console.log("Saved contact message:", savedMessage);

    // --- ADD EMAIL NOTIFICATION LOGIC HERE ---
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address (your Gmail)
      to: process.env.EMAIL_RECIPIENT, // Recipient address (your personal email)
      subject: `New Contact Form Submission: ${subject}`, // Subject line
      html: `
        <p>You have received a new message from your contact form on doggybloggy.com!</p>
        <h3>Message Details:</h3>
        <ul>
          <li><strong>Name:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Subject:</strong> ${subject}</li>
          <li><strong>Message:</strong><br>${message}</li>
        </ul>
        <p>Submitted at: ${savedMessage.submitted_at}</p>
      `, // HTML body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email notification:", error);
      } else {
        console.log("Email notification sent:", info.response);
      }
    });
    // --- END EMAIL NOTIFICATION LOGIC ---

    res.status(201).json({
      message: "Contact form submitted successfully!",
      data: savedMessage,
    });
  } catch (err) {
    console.error(
      "Error saving contact message or sending email:",
      err.message
    ); // Updated error message
    res.status(500).json({ error: "Failed to submit contact form." });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Database URL: ${process.env.DATABASE_URL}`);
  if (process.env.FRONTEND_URL) {
    console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
  }
  // Check Nodemailer status on app start (optional)
  // If transporter.verify had an error, it's logged above.
});
