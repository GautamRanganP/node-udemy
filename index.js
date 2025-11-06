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
const course_ID = [
5296886,
2084384,
5534098,
5451870,
6218639,
5117770,
6249369,
6287035,
5521188,
5424682,
6238245,
6427739,
3100552
]


const base64Credentials = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');
// Function to fetch data from Udemy API
// const fetchUdemyData = async (query) => {
//   const url = `${process.env.UDEMY_API_URL}?from_date=2025-01&to_date=2025-12&user_email=${query}`;
//   const response = await axios.get(url,{
//     headers: {
//       Authorization: `Basic ${base64Credentials}`,
//     },
//   });
//   return response.data;
// };
const fetchUdemyData = async (query) => {
  const url1 = `${process.env.UDEMY_API_URL}?from_date=2025-01&to_date=2025-12&user_email=${query}`;
  const url2 = `${process.env.UDEMY_COURSE_API_URL}?from_date=2025-01&to_date=2025-12&user_email=${query}`;
  const headers = {
    Authorization: `Basic ${base64Credentials}`,
  };
  // Run both requests in parallel and handle partial failures with allSettled
  const results = await Promise.allSettled([
    axios.get(url1, { headers }),
    axios.get(url2, { headers }),
  ]);

  const response = {
    data1: null,
    data2: null,
    errors: [],
  };
  let genAIHours = 0
  if (results[0].status === "fulfilled") {
    response.data1 = results[0].value.data;
    console.log(response.data1)
  } else {
    response.errors.push({
      url: url1,
      message: results[0].reason?.message || String(results[0].reason),
    });
  }
  if (results[1].status === "fulfilled") {
    const lookUpIds = new Set(course_ID.map(c => c));
    response.data2 = results[1].value.data
    // let filteredCourses = results[1].value.data.results.filter((course)=> lookUpIds.has(course.course_id));
  const filteredCourses = results[1].value.data.results.filter(course => {
  if (!lookUpIds.has(course.course_id)) return false;

  const raw = course.course_first_completion_date;
  if (!raw) return true; // keep if no completion date

  const dt = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(dt)) return true; // keep if can't parse

  return dt.getFullYear() > 2024; // keep only if year is greater than 2024
});
    console.log("filtered",filteredCourses)
    genAIHours = filteredCourses.reduce((acc,course)=> course.num_video_consumed_minutes + acc  ,0)
  } else {
    response.errors.push({
      url: url2,
      message: results[1].reason?.message || String(results[1].reason),
    });
  }
  if(response.data1.results.length > 0){
   let sub = response.data1.results[0].num_video_consumed_minutes - genAIHours 
   response.data1.results[0].num_video_consumed_minutes = sub > 0 ? sub : 0
  }
  
  console.log(genAIHours)
  return response.data1;
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