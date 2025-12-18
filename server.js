// ===============================
// SETUP & IMPORTS
// ===============================
let userTokens = null;

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());

// ===============================
// GOOGLE OAUTH CLIENT
// ===============================
const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ===============================
// BASIC TEST ROUTE
// ===============================
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// ===============================
// AUTH: STEP 1 – REDIRECT TO GOOGLE
// ===============================
app.get("/auth/google", (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "profile",
      "email",
    ],
  });

  res.redirect(url);
});

// ===============================
// AUTH: STEP 2 – GOOGLE CALLBACK
// ===============================
app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code;

    const { tokens } = await oauthClient.getToken(code);

    // Store tokens in memory
    userTokens = tokens;
    oauthClient.setCredentials(tokens);

    // Redirect to frontend dashboard
    res.redirect("http://localhost:3000/dashboard");
  } catch (error) {
    console.error(error);
    res.status(500).send("Google login failed");
  }
});

// ===============================
// YOUTUBE: FETCH CHANNEL
// ===============================
app.get("/youtube/channel", async (req, res) => {
  try {
    if (!userTokens) {
      return res.status(401).send("User not authenticated");
    }

    oauthClient.setCredentials(userTokens);

    const youtube = google.youtube({
      version: "v3",
      auth: oauthClient,
    });

    const response = await youtube.channels.list({
      part: "snippet,statistics",
      mine: true,
    });

    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch channel");
  }
});

// ===============================
// YOUTUBE: FETCH ALL VIDEOS
// ===============================
app.get("/youtube/videos", async (req, res) => {
  try {
    if (!userTokens) {
      return res.status(401).send("User not authenticated");
    }

    oauthClient.setCredentials(userTokens);

    const youtube = google.youtube({
      version: "v3",
      auth: oauthClient,
    });

    // Get uploads playlist
    const channelResponse = await youtube.channels.list({
      part: "contentDetails",
      mine: true,
    });

    const uploadsPlaylistId =
      channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

    let videos = [];
    let nextPageToken = null;

    do {
      const playlistResponse = await youtube.playlistItems.list({
        part: "snippet",
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken || undefined,
      });

      playlistResponse.data.items.forEach((item) => {
        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
        });
      });

      nextPageToken = playlistResponse.data.nextPageToken;
    } while (nextPageToken);

    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch videos");
  }
});

// ===============================
// YOUTUBE: UPDATE TITLES (FULL REPLACEMENT)
// ===============================
app.post("/youtube/update-titles", async (req, res) => {
  try {
    const { newTitle, videoIds } = req.body;

    if (!newTitle) {
      return res.status(400).send("New title is required");
    }

    if (!videoIds || videoIds.length === 0) {
      return res.status(400).send("No videos selected");
    }

    const youtube = google.youtube({
      version: "v3",
      auth: oauthClient,
    });

    const updatedVideos = [];

    for (const videoId of videoIds) {
      // Get existing video data
      const videoRes = await youtube.videos.list({
        part: "snippet",
        id: videoId,
      });

      const snippet = videoRes.data.items[0].snippet;

      // Update title ONLY
      await youtube.videos.update({
        part: "snippet",
        requestBody: {
          id: videoId,
          snippet: {
            ...snippet,
            title: newTitle,
          },
        },
      });

      updatedVideos.push(videoId);
    }

    res.json({
      message: "Titles updated successfully",
      updatedVideos,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to update titles");
  }
});




// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
;
