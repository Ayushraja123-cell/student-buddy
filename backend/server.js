/* =====================================================
   STUDENT BUDDY — Backend Server
   Express + MongoDB + Firebase Auth
   ===================================================== */

require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const admin      = require('firebase-admin');
const jwt        = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3001;

// ════════════════════════════════════════════════════
// FIREBASE ADMIN INIT
// ════════════════════════════════════════════════════
try {
  const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('✅ Firebase Admin initialized');
} catch (e) {
  console.warn('⚠️  Firebase Admin not initialized — auth routes will be disabled');
  console.warn('    Download service account JSON from Firebase Console → Project Settings');
}

// ════════════════════════════════════════════════════
// MIDDLEWARE
// ════════════════════════════════════════════════════
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

// CORS — allow the Chrome extension
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      `chrome-extension://${process.env.EXTENSION_ID}`,
      'http://localhost:5173',   // vite dev server (for future web dashboard)
      'http://localhost:3000'
    ];
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting — 100 requests per 15 minutes per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true });
app.use('/api/', limiter);

// ════════════════════════════════════════════════════
// MONGOOSE MODELS
// ════════════════════════════════════════════════════

// ── User ─────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  uid:          { type: String, required: true, unique: true }, // Firebase UID
  email:        { type: String, required: true },
  displayName:  { type: String },
  photoURL:     { type: String },
  createdAt:    { type: Date, default: Date.now },
  lastSeen:     { type: Date, default: Date.now },
  settings: {
    notifications:  { type: Boolean, default: true },
    autoStartBreak: { type: Boolean, default: false },
    focusDuration:  { type: Number, default: 25 },
    shortBreak:     { type: Number, default: 5 },
    longBreak:      { type: Number, default: 15 }
  }
});
const User = mongoose.model('User', userSchema);

// ── Task ─────────────────────────────────────────────
const subtaskSchema = new mongoose.Schema({
  text: String, done: { type: Boolean, default: false }
}, { _id: true });

const taskSchema = new mongoose.Schema({
  userId:   { type: String, required: true, index: true },
  text:     { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  subject:  { type: String, default: '' },
  due:      { type: String, default: '' },
  done:     { type: Boolean, default: false },
  subtasks: [subtaskSchema],
  recurring:{ type: String, enum: ['none', 'daily', 'weekly'], default: 'none' },
  createdAt:{ type: Date, default: Date.now },
  updatedAt:{ type: Date, default: Date.now }
});
taskSchema.pre('save', function(next) { this.updatedAt = Date.now(); next(); });
const Task = mongoose.model('Task', taskSchema);

// ── Flashcard ─────────────────────────────────────────
const cardSchema = new mongoose.Schema({
  front:       String,
  back:        String,
  score:       { type: Number, default: 0 },
  easiness:    { type: Number, default: 2.5 },   // SM-2
  interval:    { type: Number, default: 1 },      // days
  repetitions: { type: Number, default: 0 },
  nextReview:  { type: Date, default: Date.now },
  lastReviewed:{ type: Date }
}, { timestamps: true });

const deckSchema = new mongoose.Schema({
  userId:   { type: String, required: true, index: true },
  name:     { type: String, required: true },
  emoji:    { type: String, default: '📚' },
  cards:    [cardSchema]
}, { timestamps: true });
const Deck = mongoose.model('Deck', deckSchema);

// ── Study Stats ───────────────────────────────────────
const statsSchema = new mongoose.Schema({
  userId:        { type: String, required: true, index: true },
  date:          { type: String, required: true },         // YYYY-MM-DD
  pomodoros:     { type: Number, default: 0 },
  focusMinutes:  { type: Number, default: 0 },
  tasksCompleted:{ type: Number, default: 0 },
  cardsReviewed: { type: Number, default: 0 }
}, { timestamps: true });
statsSchema.index({ userId: 1, date: 1 }, { unique: true });
const Stats = mongoose.model('Stats', statsSchema);

// ════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════════════
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const token = header.slice(7);
  try {
    // Try Firebase ID token first
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    return next();
  } catch (_) {
    // Fallback: JWT (for non-Firebase users / testing)
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      req.uid = payload.uid;
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
}

// ════════════════════════════════════════════════════
// ROUTES — AUTH
// ════════════════════════════════════════════════════

// POST /api/auth/google  — exchange Firebase ID token for user record
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken required' });

    const decoded = await admin.auth().verifyIdToken(idToken);
    let user = await User.findOne({ uid: decoded.uid });

    if (!user) {
      user = await User.create({
        uid:        decoded.uid,
        email:      decoded.email,
        displayName:decoded.name,
        photoURL:   decoded.picture
      });
    } else {
      user.lastSeen = Date.now();
      await user.save();
    }

    // Issue our own JWT for API calls
    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET || 'dev-secret', {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.json({ token, user: { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL } });
  } catch (e) {
    console.error('Auth error:', e.message);
    res.status(401).json({ error: e.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await User.findOne({ uid: req.uid });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, settings: user.settings });
});

// PUT /api/auth/settings
app.put('/api/auth/settings', authenticate, async (req, res) => {
  const user = await User.findOneAndUpdate(
    { uid: req.uid },
    { $set: { settings: req.body } },
    { new: true }
  );
  res.json({ settings: user.settings });
});

// ════════════════════════════════════════════════════
// ROUTES — TASKS
// ════════════════════════════════════════════════════

// GET /api/tasks
app.get('/api/tasks', authenticate, async (req, res) => {
  const tasks = await Task.find({ userId: req.uid }).sort({ createdAt: -1 });
  res.json(tasks);
});

// POST /api/tasks
app.post('/api/tasks', authenticate, async (req, res) => {
  const task = await Task.create({ ...req.body, userId: req.uid });
  res.status(201).json(task);
});

// PUT /api/tasks/:id
app.put('/api/tasks/:id', authenticate, async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.uid },
    { $set: req.body },
    { new: true }
  );
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', authenticate, async (req, res) => {
  await Task.findOneAndDelete({ _id: req.params.id, userId: req.uid });
  res.json({ deleted: true });
});

// POST /api/tasks/sync — bulk upsert (offline sync)
app.post('/api/tasks/sync', authenticate, async (req, res) => {
  const { tasks } = req.body;
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks array required' });
  const ops = tasks.map(t => ({
    updateOne: {
      filter: { userId: req.uid, _id: t._id || new mongoose.Types.ObjectId() },
      update: { $set: { ...t, userId: req.uid } },
      upsert: true
    }
  }));
  await Task.bulkWrite(ops);
  const updated = await Task.find({ userId: req.uid }).sort({ createdAt: -1 });
  res.json(updated);
});

// ════════════════════════════════════════════════════
// ROUTES — DECKS / FLASHCARDS
// ════════════════════════════════════════════════════

// GET /api/decks
app.get('/api/decks', authenticate, async (req, res) => {
  const decks = await Deck.find({ userId: req.uid }).sort({ createdAt: -1 });
  res.json(decks);
});

// POST /api/decks
app.post('/api/decks', authenticate, async (req, res) => {
  const deck = await Deck.create({ ...req.body, userId: req.uid });
  res.status(201).json(deck);
});

// DELETE /api/decks/:id
app.delete('/api/decks/:id', authenticate, async (req, res) => {
  await Deck.findOneAndDelete({ _id: req.params.id, userId: req.uid });
  res.json({ deleted: true });
});

// POST /api/decks/:id/cards
app.post('/api/decks/:id/cards', authenticate, async (req, res) => {
  const deck = await Deck.findOneAndUpdate(
    { _id: req.params.id, userId: req.uid },
    { $push: { cards: req.body } },
    { new: true }
  );
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  res.status(201).json(deck);
});

// PUT /api/decks/:deckId/cards/:cardId  — update card (score, SM-2 data)
app.put('/api/decks/:deckId/cards/:cardId', authenticate, async (req, res) => {
  const deck = await Deck.findOne({ _id: req.params.deckId, userId: req.uid });
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  const card = deck.cards.id(req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  Object.assign(card, req.body);
  await deck.save();
  res.json(card);
});

// POST /api/decks/sync — bulk sync all decks
app.post('/api/decks/sync', authenticate, async (req, res) => {
  const { decks } = req.body;
  // Delete existing and replace with synced data
  await Deck.deleteMany({ userId: req.uid });
  const created = await Deck.insertMany(decks.map(d => ({ ...d, userId: req.uid })));
  res.json(created);
});

// ════════════════════════════════════════════════════
// ROUTES — STATS
// ════════════════════════════════════════════════════

// GET /api/stats?days=7
app.get('/api/stats', authenticate, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);
  const stats = await Stats.find({ userId: req.uid, date: { $gte: fromStr } }).sort({ date: 1 });
  res.json(stats);
});

// POST /api/stats — upsert today's stats
app.post('/api/stats', authenticate, async (req, res) => {
  const { date, pomodoros = 0, focusMinutes = 0, tasksCompleted = 0, cardsReviewed = 0 } = req.body;
  const stats = await Stats.findOneAndUpdate(
    { userId: req.uid, date },
    { $inc: { pomodoros, focusMinutes, tasksCompleted, cardsReviewed } },
    { upsert: true, new: true }
  );
  res.json(stats);
});

// ════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ── 404 handler ──────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════
async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/studentbuddy');
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`\n🚀 Student Buddy Backend running at http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   Tasks:  http://localhost:${PORT}/api/tasks`);
      console.log(`   Decks:  http://localhost:${PORT}/api/decks\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
  }
}

start();
