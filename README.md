# 🎓 Student Buddy — Chrome Extension

An all-in-one AI-powered study companion built as a Chrome Extension (Manifest V3).

## ✨ Features
- ⏱️ **Pomodoro Timer** — Background timer with badge countdown & notifications
- ✅ **To-Do List** — Tasks with priority, subject tags & due dates
- 🃏 **Flashcard Decks** — 3D flip cards with spaced-repetition rating
- 🤖 **AI Summarizer** — Gemini AI: summarize, quiz, key terms, custom Q&A
- 📊 **Study Stats** — Daily streak, focus time chart, session tracking
- 📝 **Quick Notes** — Auto-saving global & per-page notes
- 📅 **Weekly Planner** — Color-coded subject schedule grid
- 🎯 **Focus Mode** — Block distracting websites during study sessions

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

## 🗂️ Project Structure

```
student-buddy/
├── manifest.json        ← Chrome MV3 manifest
├── service_worker.js    ← Background: alarms, badge, focus mode
├── content_script.js    ← Page text extraction for AI
├── blocked.html         ← Focus mode redirect page
├── popup.html           ← Main extension popup (8 tabs)
├── popup.css            ← Dark glassmorphism styles
├── popup.js             ← All feature logic
└── icons/               ← Extension icons (16, 48, 128px)
```

## 📅 Development Roadmap

| Week | Feature | Status |
|------|---------|--------|
| 1 | Core extension — all 8 features locally | ✅ Done |
| 2 | AI Summarizer — streaming, history, save-to-card | 🔜 |
| 3 | Tasks & Flashcards — SM-2, CSV import/export | 🔜 |
| 4 | Backend — Node.js + MongoDB cloud sync | 🔜 |
| 5 | Auth + Polish — Google OAuth, Web Store publish | 🔜 |

## 🛠️ Tech Stack

- **Extension:** Chrome Manifest V3, Vanilla JS/CSS
- **AI:** Google Gemini 1.5 Flash API
- **Storage:** `chrome.storage.local` (Week 1-3), MongoDB (Week 4+)
- **Auth:** Firebase Authentication (Week 5)
- **Backend:** Node.js + Express (Week 4)

## 📄 License

MIT License — feel free to use and learn from this project!
