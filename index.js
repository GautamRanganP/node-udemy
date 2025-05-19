require("dotenv").config();
const express = require("express");
const axios = require("axios");
const Redis = require("ioredis");
const cors = require('cors');
const app = express();
const PORT = 3000;
const redis = new Redis(process.env.REDIS_URL);

const allowedOrigin = process.env.PRODUCTION_URL;
app.use(cors({
    origin: allowedOrigin
}));
// Initialize Redis
// const redis = new Redis({ 
//     url:process.env.REDIS_URL,
//     token:process.env.REDIS_Token
// });
// const rateLimit = async (req, res, next) => {
//     const userId = req.query.user_id;
//     if (!userId) return res.status(400).json({ error: "User ID required" });
   
//     const key = `rate_limit:${userId}`;
//     const requests = await redis.incr(key);
   
//     if (requests === 1) {
//       await redis.expire(key, 60); // Set 1-minute expiry
//     }
   
//     if (requests > 5) {
//       return res.status(429).json({ error: "Too many requests. Try again later." });
//     }
   
//     next();
//   };


const base64Credentials = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');
// Function to fetch data from Udemy API
const fetchUdemyData = async (query) => {
  const currentDate = new Date();
  const formattedDate = currentDate.getFullYear() + '-' +
                      String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
                      String(currentDate.getDate()).padStart(2, '0');
  const url = `${process.env.UDEMY_API_URL}?from_date=${formattedDate}&to_date=2025-12-12&user_email=${query}`;
  const response = await axios.get(url,{
    headers: {
      Authorization: `Basic ${base64Credentials}`,
    },
  });
  return response.data;
};
app.get("/", async (req, res) => {
  return res.status(200).send("Welcome server up and running");
})

app.get("/learninghours", async (req, res) => {
  const email = req.query.user_email
  if (!email) {
    // Return a 400 Bad Request error if email is missing
    return res.status(400).json({ error: "Email is required" });
    }
  try {
    // Check if data is already cached in Redis
    const cachedData = await redis.get(email);
    if (cachedData) {
      console.log("Serving from cache");
      return res.json(JSON.parse(cachedData));
    }
    
    // Fetch fresh data from Udemy API
    console.log("Fetching from Udemy API...");
    const data = await fetchUdemyData(email);
    // Store data in Redis with expiry (e.g., 5 minutes)
    await redis.set(email, JSON.stringify(data), "EX", process.env.CACHE_EXPIRY);
    
    res.json(data);
  } catch (error) {
    console.error("Error fetching Udemy API:", error.message);
    res.status(500).json({ error: "Failed to fetch Udemy API" });
  }
});
 
module.exports = app;
// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));