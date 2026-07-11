const path = require('path');
const ejs = require('ejs');
const db = require('../config/db');

const settingsView = path.join(__dirname, '..', 'views', 'settings', 'index.ejs');

function showSettings(req, res) {
  const userId = req.session.user.id;
  db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) {
      return res.redirect('/');
    }

    ejs.renderFile(settingsView, { user, saved: req.query.saved === '1' }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render settings:', renderErr.message);
        html = '<div class="p-3">Unable to load settings.</div>';
      }

      res.render('layout', {
        title: 'Settings',
        page: 'settings',
        body: html,
      });
    });
  });
}

function updatePassword(req, res) {
  const userId = req.session.user.id;
  const { newUsername, newPassword } = req.body;

  db.run(
    `UPDATE users SET username = ?, password = ? WHERE id = ?`,
    [newUsername, newPassword, userId],
    () => {
      req.session.user.username = newUsername;
      res.redirect('/settings?saved=1');
    }
  );
}

module.exports = {
  showSettings,
  updatePassword,
};
