// Required dependencies
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();

app.use((req, res, next) => {
  console.log("REQ:", req.method, req.url);
  next();
});

// Configuration constants
const PORT = 8080;
const STUDENT_ID = "M01036102"; // Student ID - included in all API paths
const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "artwork_social_db";

// Middleware setup
app.use(express.json()); // Parse JSON request bodies
app.use(cors()); // Enable Cross-Origin Resource Sharing

// Session configuration for user authentication
app.use(
  session({
    secret: "session-key", // Secret for signing session IDs
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 }, // 2 hour session timeout
  })
);

// Serve static files and the Single Page Application (SPA)
const frontendDir = path.join(__dirname, "public"); // Frontend files located in public folder

// Redirect root path to /{STUDENT_ID} to include student ID in URL
app.get("/", (req, res) => {
  res.redirect(`/${STUDENT_ID}`);
});

// Serve the main SPA HTML file at /{STUDENT_ID}
app.get(`/${STUDENT_ID}`, (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

// Allow deep links like /{STUDENT_ID}/feed etc. to return the SPA shell when requesting HTML
const spaPages = new Set(["auth", "post", "feed", "search", "profile", "map", "inspo", "inspiration"]);
app.get(`/${STUDENT_ID}/:page`, (req, res, next) => {
  const { page } = req.params;
  // Only intercept for known SPA pages and only when the browser expects HTML
  if (spaPages.has(page) && (req.headers.accept || "").includes("text/html")) {
    return res.sendFile(path.join(frontendDir, "index.html"));
  }
  return next();
});

// Serve static assets (CSS/JS/images) at both / and /{STUDENT_ID}/ paths
// This ensures stylesheets and scripts load correctly
app.use(express.static(frontendDir));
app.use(`/${STUDENT_ID}`, express.static(frontendDir));

// Uploads folder is located inside the public folder for easier access
const uploadsDir = path.join(frontendDir, "uploads");
const artworksDir = path.join(uploadsDir, "artworks"); // Store artwork images here
const avatarsDir = path.join(uploadsDir, "avatars"); // Store user avatars here (reserved for future use)

// Create upload directories if they don't exist
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(artworksDir)) fs.mkdirSync(artworksDir);
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir);

// Files served directly via static middleware - accessible at /uploads/artworks/ and /uploads/avatars/

// Multer handles multipart/form-data for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // All uploaded images go to the artworks directory
    cb(null, artworksDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename using timestamp and random number
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});
const upload = multer({ storage });

// Collections for storing user data, artworks, relationships, and interactions
let db, usersCollection, artworksCollection, followsCollection, likesCollection, commentsCollection;

async function startServer() {
  try {
    // Connect to MongoDB instance
    const client = await MongoClient.connect(MONGO_URL);
    console.log("Connected to MongoDB");
    db = client.db(DB_NAME);

    // Initialize collections (MongoDB will create them on first insert if they don't exist)
    usersCollection = db.collection("users"); // Stores user accounts and profiles
    artworksCollection = db.collection("artworks"); // Stores artwork posts
    followsCollection = db.collection("follows"); // Stores follow relationships between users
    likesCollection = db.collection("likes"); // Stores which users liked which artworks
    commentsCollection = db.collection("comments"); // Stores comments on artworks

    // All endpoints are prefixed with /{STUDENT_ID}/ for proper routing
    // WEB SCRAPING: fetch inspiration quotes (live only; no static fallback)
    app.get(`/${STUDENT_ID}/inspiration`, async (req, res) => {
      let browser;
      try {
        const resolveExecutable = () => {
          const candidates = [
            process.env.PUPPETEER_EXECUTABLE_PATH,
            process.env.CHROME_PATH,
            puppeteer.executablePath(),
            path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
            path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
            path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
            path.join(process.env.PROGRAMFILES || "", "Microsoft/Edge/Application/msedge.exe"),
            path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
            path.join(process.env.LOCALAPPDATA || "", "Microsoft/Edge/Application/msedge.exe"),
          ].filter(Boolean);

          for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
          }
          return null;
        };

        const executablePath = resolveExecutable();
        if (!executablePath) {
          return res.status(502).json({
            success: false,
            message: "Chrome/Chromium not found. Install Chrome or set PUPPETEER_EXECUTABLE_PATH to the browser executable.",
            items: [],
          });
        }

        browser = await puppeteer.launch({
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          executablePath,
        });

        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        page.setDefaultTimeout(30000);

        await page.goto("https://lorimcnee.com/favorite-art-quotes/", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        const items = await page.evaluate(() => {
          const collect = (selector) =>
            Array.from(document.querySelectorAll(selector))
              .map((el) => (el.innerText || "").trim())
              .filter(Boolean);

          const candidates = [
            ...collect("blockquote"),
            ...collect("p"),
          ]
            .map((txt) => txt.replace(/\s+/g, " "))
            .filter((txt) => txt.length > 25 && txt.length < 220)
            .filter((txt) => /[\.\u2019\u201c\u201d]/.test(txt));

          const seen = new Set();
          for (const quote of candidates) {
            const key = quote.toLowerCase();
            if (!seen.has(key)) {
              return [{ text: quote }]; // return first unique, single quote only
            }
          }
          return [];
        });

        if (items.length === 0) {
          return res.status(502).json({
            success: false,
            message: "No quotes were found on the source page.",
            items: [],
          });
        }

        return res.json({ success: true, items });
      } catch (err) {
        console.error("inspiration scrape error:", err);
        return res.status(502).json({
          success: false,
          message: "Art quotes unavailable (scrape failed). Please try again.",
          items: [],
        });
      } finally {
        if (browser) await browser.close();
      }
    });

    // AUTHENTICATION: User registration - create a new account
    // POST /{STUDENT_ID}/users
    // Body: { username, email, password, bio (optional) }
    // Returns: { success, userId }
    app.post(`/${STUDENT_ID}/users`, async (req, res) => {
      try {
        const { username, email, password, bio } = req.body;

        if (!username || !email || !password) {
          return res.status(400).json({
            success: false,
            message: "username, email and password are required",
          });
        }

        // Check if username or email already exists
        const existingUser = await usersCollection.findOne({
          $or: [{ username }, { email }],
        });

        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "username or email already in use",
          });
        }

        // Create new user document
        const newUser = {
          username,
          email,
          password, // Note: In production, this should be hashed with bcrypt
          bio: bio || "",
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);

        return res.status(201).json({
          success: true,
          message: "User registered successfully",
          userId: result.insertedId,
        });
      } catch (err) {
        console.error("Error in POST /users:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while registering user",
        });
      }
    });

    // SEARCH: Find users by username (case-insensitive)
    // GET /{STUDENT_ID}/users?q=searchterm
    // Query param: q - username to search for
    // Returns: { success, results: [{username, bio}, ...] }
    app.get(`/${STUDENT_ID}/users`, async (req, res) => {
      try {
        const q = req.query.q || "";

        let filter = {};
        if (q.trim() !== "") {
          // Case-insensitive regular expression search
          const regex = new RegExp(q.trim(), "i");
          filter = { username: regex };
        }

        // Query users with projection to exclude sensitive data
        const users = await usersCollection
          .find(filter, { projection: { _id: 0, username: 1, bio: 1 } })
      .limit(20)
      .toArray();

    return res.json({
      success: true,
      results: users,
    });
  } catch (err) {
    console.error("Error in GET /users:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while searching users",
    });
  }
});
    

    // login: POST /{STUDENT_ID}/login
    app.post(`/${STUDENT_ID}/login`, async (req, res) => {
      try {
        const { username, password } = req.body;

        if (!username || !password) {
          return res.status(400).json({
            success: false,
            message: "username and password are required",
          });
        }

        const user = await usersCollection.findOne({ username });

        if (!user || user.password !== password) {
          return res.status(401).json({
            success: false,
            message: "Invalid username or password",
          });
        }

        req.session.userId = user._id.toString();
        req.session.username = user.username;

        return res.json({
          success: true,
          message: "Login successful",
          username: user.username,
        });
      } catch (err) {
        console.error("Error in POST /login:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while logging in",
        });
      }
    });

    // login status: GET /{STUDENT_ID}/login
    app.get(`/${STUDENT_ID}/login`, (req, res) => {
      if (req.session.userId) {
        return res.json({
          loggedIn: true,
          userId: req.session.userId,
          username: req.session.username,
        });
      } else {
        return res.json({
          loggedIn: false,
        });
      }
    });

    // logout: DELETE /{STUDENT_ID}/login
    app.delete(`/${STUDENT_ID}/login`, (req, res) => {
      if (!req.session.userId) {
        return res.json({
          success: true,
          message: "Already logged out",
        });
      }

      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
          return res.status(500).json({
            success: false,
            message: "Error logging out",
          });
        }

        res.clearCookie("connect.sid");
        return res.json({
          success: true,
          message: "Logged out successfully",
        });
      });
    });

    // create artwork post: POST /{STUDENT_ID}/contents
    app.post(`/${STUDENT_ID}/contents`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to post artwork",
          });
        }

        const { title, description, tags } = req.body;

        if (!title || !description) {
          return res.status(400).json({
            success: false,
            message: "title and description are required",
          });
        }

        const newArtwork = {
          authorId: new ObjectId(req.session.userId),
          title,
          description,
          tags: Array.isArray(tags) ? tags : [],
          imagePath: null,
          createdAt: new Date(),
          likeCount: 0,
        };

        const result = await artworksCollection.insertOne(newArtwork);

        return res.status(201).json({
          success: true,
          message: "Artwork posted successfully",
          artworkId: result.insertedId,
        });
      } catch (err) {
        console.error("Error in POST /contents:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while posting artwork",
        });
      }
    });

    // search artworks: GET /{STUDENT_ID}/contents?q=...
    app.get(`/${STUDENT_ID}/contents`, async (req, res) => {
      try {
        const q = req.query.q || "";
        let filter = {};

        if (q.trim() !== "") {
          const regex = new RegExp(q.trim(), "i");
          filter = {
            $or: [{ title: regex }, { description: regex }, { tags: regex }],
          };
        }

        const artworks = await artworksCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();

        const formatted = artworks.map((a) => ({
          id: a._id,
          title: a.title,
          description: a.description,
          tags: a.tags,
          createdAt: a.createdAt,
          likeCount: a.likeCount || 0,
          authorId: a.authorId,
          imagePath: a.imagePath || null,
          authorUsername: a.authorUsername || undefined, // optional if you add later
        }));

        return res.json({
          success: true,
          results: formatted,
        });
      } catch (err) {
        console.error("Error in GET /contents:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while searching artworks",
        });
      }
    });

    // follow user: POST /{STUDENT_ID}/follow
    app.post(`/${STUDENT_ID}/follow`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to follow users",
          });
        }

        const { targetUsername } = req.body;

        if (!targetUsername) {
          return res.status(400).json({
            success: false,
            message: "targetUsername is required",
          });
        }

        const targetUser = await usersCollection.findOne({ username: targetUsername });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        if (targetUser._id.toString() === req.session.userId) {
          return res.status(400).json({
            success: false,
            message: "You cannot follow yourself",
          });
        }

        const existing = await followsCollection.findOne({
          followerId: new ObjectId(req.session.userId),
          followingId: targetUser._id,
        });

        if (existing) {
          return res.json({
            success: true,
            message: "Already following this user",
          });
        }

        await followsCollection.insertOne({
          followerId: new ObjectId(req.session.userId),
          followingId: targetUser._id,
        });

        return res.json({
          success: true,
          message: `You are now following ${targetUsername}`,
        });
      } catch (err) {
        console.error("Error in POST /follow:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while following user",
        });
      }
    });

    // unfollow user: DELETE /{STUDENT_ID}/follow
    app.delete(`/${STUDENT_ID}/follow`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to unfollow users",
          });
        }

        const { targetUsername } = req.body;

        if (!targetUsername) {
          return res.status(400).json({
            success: false,
            message: "targetUsername is required",
          });
        }

        const targetUser = await usersCollection.findOne({ username: targetUsername });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        await followsCollection.deleteOne({
          followerId: new ObjectId(req.session.userId),
          followingId: targetUser._id,
        });

        return res.json({
          success: true,
          message: `You unfollowed ${targetUsername}`,
        });
      } catch (err) {
        console.error("Error in DELETE /follow:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while unfollowing user",
        });
      }
    });

    // feed: GET /{STUDENT_ID}/feed
    app.get(`/${STUDENT_ID}/feed`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to view your feed",
          });
        }

        const following = await followsCollection
          .find({ followerId: new ObjectId(req.session.userId) })
          .toArray();

        const followingIds = following.map((f) => f.followingId);

        const feedArtworks = await artworksCollection
          .find({ authorId: { $in: followingIds } })
          .sort({ createdAt: -1 })
          .toArray();

        return res.json({
          success: true,
          feed: feedArtworks,
        });
      } catch (err) {
        console.error("Error in GET /feed:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while getting feed",
        });
      }
    });

    // upload artwork image: POST /{STUDENT_ID}/upload/artwork
    app.post(`/${STUDENT_ID}/upload/artwork`, upload.single("artImage"), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to upload images",
          });
        }

        const { artworkId } = req.body;

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "No file uploaded",
          });
        }

        const imagePath = `/uploads/artworks/${req.file.filename}`;

        if (artworkId) {
          await artworksCollection.updateOne(
            { _id: new ObjectId(artworkId) },
            { $set: { imagePath } }
          );
        }

        return res.json({
          success: true,
          message: "Image uploaded successfully",
          imagePath,
          artworkId: artworkId || null,
        });
      } catch (err) {
        console.error("Error in POST /upload/artwork:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while uploading image",
        });
      }
    });

    // get user profile: GET /{STUDENT_ID}/profile
    app.get(`/${STUDENT_ID}/profile`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to view profile",
          });
        }

        const user = await usersCollection.findOne(
          { _id: new ObjectId(req.session.userId) },
          { projection: { password: 0 } }
        );

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        const artworkCount = await artworksCollection.countDocuments({
          authorId: new ObjectId(req.session.userId),
        });

        const userArtworks = await artworksCollection
          .find({ authorId: new ObjectId(req.session.userId) })
          .sort({ createdAt: -1 })
          .toArray();

        const formattedArtworks = userArtworks.map((a) => ({
          id: a._id,
          title: a.title,
          description: a.description,
          imagePath: a.imagePath || null,
          createdAt: a.createdAt,
          likeCount: a.likeCount || 0,
        }));

        return res.json({
          success: true,
          profile: {
            username: user.username,
            email: user.email,
            bio: user.bio || "",
            createdAt: user.createdAt,
            artworkCount,
          },
          artworks: formattedArtworks,
        });
      } catch (err) {
        console.error("Error in GET /profile:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while getting profile",
        });
      }
    });

    // like/unlike artwork: POST /{STUDENT_ID}/contents/{id}/like
    app.post(`/${STUDENT_ID}/contents/:artworkId/like`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to like artwork",
          });
        }

        const { artworkId } = req.params;

        const artwork = await artworksCollection.findOne({
          _id: new ObjectId(artworkId),
        });

        if (!artwork) {
          return res.status(404).json({
            success: false,
            message: "Artwork not found",
          });
        }

        const existing = await likesCollection.findOne({
          userId: new ObjectId(req.session.userId),
          artworkId: new ObjectId(artworkId),
        });

        if (existing) {
          // unlike
          await likesCollection.deleteOne({
            userId: new ObjectId(req.session.userId),
            artworkId: new ObjectId(artworkId),
          });

          await artworksCollection.updateOne(
            { _id: new ObjectId(artworkId) },
            { $inc: { likeCount: -1 } }
          );

          const updatedArtwork = await artworksCollection.findOne({
            _id: new ObjectId(artworkId),
          });

          return res.json({
            success: true,
            message: "Like removed",
            liked: false,
            likeCount: updatedArtwork.likeCount || 0,
          });
        } else {
          // like
          await likesCollection.insertOne({
            userId: new ObjectId(req.session.userId),
            artworkId: new ObjectId(artworkId),
            createdAt: new Date(),
          });

          await artworksCollection.updateOne(
            { _id: new ObjectId(artworkId) },
            { $inc: { likeCount: 1 } }
          );

          const updatedArtwork = await artworksCollection.findOne({
            _id: new ObjectId(artworkId),
          });

          return res.json({
            success: true,
            message: "Artwork liked",
            liked: true,
            likeCount: updatedArtwork.likeCount || 0,
          });
        }
      } catch (err) {
        console.error("Error in POST /contents/:artworkId/like:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while liking artwork",
        });
      }
    });

    // get comments: GET /{STUDENT_ID}/contents/{id}/comments
    app.get(`/${STUDENT_ID}/contents/:artworkId/comments`, async (req, res) => {
      try {
        const { artworkId } = req.params;

        const comments = await commentsCollection
          .find({ artworkId: new ObjectId(artworkId) })
          .sort({ createdAt: 1 })
          .toArray();

        const formatted = comments.map((c) => ({
          id: c._id,
          text: c.text,
          username: c.username,
          userId: c.userId,
          createdAt: c.createdAt,
        }));

        return res.json({
          success: true,
          comments: formatted,
        });
      } catch (err) {
        console.error("Error in GET /contents/:artworkId/comments:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while getting comments",
        });
      }
    });

    // post comment: POST /{STUDENT_ID}/contents/{id}/comments
    app.post(`/${STUDENT_ID}/contents/:artworkId/comments`, async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({
            success: false,
            message: "You must be logged in to comment",
          });
        }

        const { artworkId } = req.params;
        const { text } = req.body;

        if (!text || text.trim() === "") {
          return res.status(400).json({
            success: false,
            message: "Comment text is required",
          });
        }

        const artwork = await artworksCollection.findOne({
          _id: new ObjectId(artworkId),
        });

        if (!artwork) {
          return res.status(404).json({
            success: false,
            message: "Artwork not found",
          });
        }

        const newComment = {
          artworkId: new ObjectId(artworkId),
          userId: new ObjectId(req.session.userId),
          username: req.session.username,
          text: text.trim(),
          createdAt: new Date(),
        };

        const result = await commentsCollection.insertOne(newComment);

        return res.status(201).json({
          success: true,
          message: "Comment posted successfully",
          commentId: result.insertedId,
        });
      } catch (err) {
        console.error("Error in POST /contents/:artworkId/comments:", err);
        return res.status(500).json({
          success: false,
          message: "Server error while posting comment",
        });
      }
    });

    app.get(`/${STUDENT_ID}/ping`, (req, res) => {
  res.json({ message: "server is alive and MongoDB is connected!" });
});

    // start server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  }
}

startServer();