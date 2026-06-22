# 🎓 Student Buddy — Chrome Extension

An all-in-one AI-powered study companion built as a Chrome Extension (Manifest V3).

## ✨ Features
- ⏱️ **Pomodoro Timer** — Background timer with badge countdown & notifications
- ✅ **To-Do List** — Tasks with priority, subject tags, due dates & clear completed
- 🃏 **Flashcard Decks** — 3D flip cards with SM-2 spaced repetition algorithm
- 🤖 **AI Summarizer** — Gemini AI: summarize, quiz, key terms, ELI5, study guide (with streaming UI & markdown rendering)
- 📊 **Study Stats** — Daily streak, focus time chart, session tracking
- 📝 **Quick Notes** — Auto-saving global & per-page notes
- 📅 **Weekly Planner** — Color-coded subject schedule grid
- 🎯 **Focus Mode** — Block distracting websites during study sessions
- ☁️ **Cloud Sync** — Google Sign-in + backend sync (Node.js + MongoDB)
- 📤 **Data Portability** — CSV flashcard export/import, full JSON data backup/restore

## 🚀 Installation (Development)

1. Clone this repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/student-buddy.git
   ```
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load unpacked** → select the `student-buddy` folder
5. Click the 📚 icon in the toolbar to open!

## 🤖 AI Setup

1. Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Open the extension → **AI tab** → enter your key → Save
3. Navigate to any webpage and try Summarize, Quiz, ELI5, or Study Guide!

## 🗂️ Project Structure

```
student-buddy/
├── manifest.json          ← Chrome MV3 manifest
├── service_worker.js      ← Background: alarms, badge, focus mode
├── content_script.js      ← Page text extraction for AI
├── blocked.html           ← Focus mode redirect page
├── popup.html             ← Main extension popup (8 tabs)
├── popup.css              ← Dark glassmorphism styles (purple/teal)
├── popup.js               ← All feature logic (~1500 lines)
├── icons/                 ← Extension icons (16, 48, 128px)
└── backend/
    ├── server.js           ← Express + MongoDB + Firebase Auth API
    ├── package.json        ← Backend dependencies
    └── .env.example        ← Environment variable template
```

## 🖥️ Backend Setup (Optional — for Cloud Sync)

```bash
cd backend
cp .env.example .env       # then edit with your MongoDB URI, JWT secret, etc.
npm install
npm start                  # runs at http://localhost:3001
```

Required services:
- **MongoDB Atlas** (free tier) — [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
- **Firebase** (for Google Auth) — [console.firebase.google.com](https://console.firebase.google.com)

## 📅 Development Roadmap

| Week | Feature | Status |
|------|---------|--------|
| 1 | Core extension — all 8 features locally | ✅ Done |
| 2 | AI Summarizer — streaming, ELI5, study guide, save-to-card | ✅ Done |
| 3 | Tasks & Flashcards — SM-2 spaced repetition, CSV export/import | ✅ Done |
| 4 | Backend — Node.js + Express + MongoDB cloud sync | ✅ Done |
| 5 | Auth + Polish — Google OAuth, data backup, markdown AI output | ✅ Done |

## 🛠️ Tech Stack

- **Extension:** Chrome Manifest V3, Vanilla JS/CSS
- **AI:** Google Gemini 2.5 Flash API (with simulated streaming UI)
- **Storage:** `chrome.storage.local` (offline-first), MongoDB (cloud sync)
- **Auth:** Google OAuth via `chrome.identity` + Firebase Admin SDK
- **Backend:** Node.js + Express + Mongoose
- **Design:** Dark glassmorphism (purple/teal gradient), Inter font

## 📄 License

MIT License — feel free to use and learn from this project!
