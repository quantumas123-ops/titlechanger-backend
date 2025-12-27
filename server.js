
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();
const app = express();


const allowedOrigins = [
  "https://www.titlechanger.site",
  "https://titlechanger.site",
  "http://localhost:3000"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// important for preflight
app.options("*", cors());






import cors from "cors";

app.use(
  cors({
    origin: "https://www.titlechanger.site",
    credentials: true,
  })
);

app.use(express.json());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

let oauthTokens = null;

// ---------- AUTH ----------
app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
  });
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const { tokens } = await oauth2Client.getToken(req.query.code);
  oauthTokens = tokens;
  req.session.tokens = tokens;

  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
});

// ---------- YOUTUBE ----------
const youtube = google.youtube({
  version: "v3",
  auth: oauth2Client,
});

// ---------- FETCH VIDEOS ----------
app.get("/videos", async (req, res) => {
  try {
    const channelRes = await youtube.channels.list({
      part: "contentDetails",
      mine: true,
    });

    const uploadsId =
      channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;

    let videos = [];
    let nextPageToken = "";

    while (videos.length < 150) {
      const playlistRes = await youtube.playlistItems.list({
        part: "contentDetails",
        playlistId: uploadsId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      const videoIds = playlistRes.data.items.map(
        (i) => i.contentDetails.videoId
      );

      const videoRes = await youtube.videos.list({
        part: "snippet,status,statistics",
        id: videoIds.join(","),
      });

      videos.push(...videoRes.data.items);
      nextPageToken = playlistRes.data.nextPageToken;
      if (!nextPageToken) break;
    }

    // 🔒 ONLY PUBLIC VIDEOS
    if (!req.session.tokens) {
  return res.status(401).json({ error: "Not authenticated" });
}

oauth2Client.setCredentials(req.session.tokens);

    const publicVideos = videos.filter(
      (v) => v.status.privacyStatus === "public"
    );

    res.json(publicVideos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load videos" });
  }
});

// ---------- UPDATE TITLES ----------
app.post("/update-titles", async (req, res) => {
  try {
    const { title, videos } = req.body;

    for (const video of videos) {
      await youtube.videos.update({
        part: "snippet",
        requestBody: {
          id: video.id,
          snippet: {
            title,
            categoryId: video.snippet.categoryId,
          },
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

app.listen(5000, () => {
  console.log("Backend running on port 5000");
});


