const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const accountsRoutes = require('./routes/accounts');
const contactsRoutes = require('./routes/contacts');
const broadcastRoutes = require('./routes/broadcast');
const flowsRoutes = require('./routes/flows');
const conversationsRoutes = require('./routes/conversations');
const settingsRoutes = require('./routes/settings');
const { initDB } = require('./database/init');
const db = require('./config/db');
const { createClient, setupGracefulShutdown, startHeartbeat, cleanupOrphanSessions } = require('./config/whatsapp');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'whatsapp_secret',
    resave: false,
    saveUninitialized: false,
  })
);

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'sessions'), { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function requireLogin(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}

app.use(authRoutes);
app.use(requireLogin);
app.use(dashboardRoutes);
app.use(accountsRoutes);
app.use(contactsRoutes);
app.use(broadcastRoutes);
app.use(flowsRoutes);
app.use(conversationsRoutes);
app.use(settingsRoutes);

initDB();
cleanupOrphanSessions();

db.all(`SELECT * FROM accounts WHERE status = 'connected'`, (err, rows) => {
  if (!err && Array.isArray(rows)) {
    rows.forEach((account) => {
      createClient(account);
    });
  }
});

setupGracefulShutdown();
startHeartbeat();

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
