const path = require('path');
const ejs = require('ejs');
const db = require('../config/db');

const dashboardView = path.join(__dirname, '..', 'views', 'dashboard', 'index.ejs');

function showDashboard(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    totalAccounts: 0,
    connectedAccounts: 0,
    staleAccounts: 0,
    totalContacts: 0,
    messagesToday: 0,
    messages: [],
  };

  db.get(`SELECT COUNT(*) AS count FROM accounts`, (err, row) => {
    stats.totalAccounts = row ? row.count : 0;

    db.get(
      `SELECT COUNT(*) AS count FROM accounts WHERE status = 'connected'`,
      (err2, row2) => {
        stats.connectedAccounts = row2 ? row2.count : 0;

        db.get(
          `SELECT COUNT(*) AS count FROM accounts WHERE status = 'connected' AND (last_activity IS NULL OR last_activity < datetime('now', '-12 hours'))`,
          (errStale, rowStale) => {
            stats.staleAccounts = rowStale ? rowStale.count : 0;

            db.get(`SELECT COUNT(*) AS count FROM contacts`, (err3, row3) => {
              stats.totalContacts = row3 ? row3.count : 0;

              db.get(
                `SELECT COUNT(*) AS count FROM messages WHERE created_at LIKE ?`,
                [today + '%'],
                (err4, row4) => {
                  stats.messagesToday = row4 ? row4.count : 0;

                  db.all(
                    `SELECT messages.message, messages.direction, messages.created_at, accounts.name AS accountName, contacts.phone AS contactPhone
                     FROM messages
                     LEFT JOIN accounts ON accounts.id = messages.account_id
                     LEFT JOIN contacts ON contacts.id = messages.contact_id
                     ORDER BY messages.created_at DESC
                     LIMIT 10`,
                    (err5, rows) => {
                      stats.messages = rows || [];
                      ejs.renderFile(dashboardView, { stats }, (renderErr, html) => {
                        if (renderErr) {
                          console.error('Failed to render dashboard:', renderErr.message);
                          html = '<div class="p-3">Unable to load dashboard.</div>';
                        }

                        res.render('layout', {
                          title: 'Dashboard',
                          page: 'dashboard',
                          body: html,
                        });
                      });
                    }
                  );
                }
              );
            });
          }
        );
      }
    );
  });
}

module.exports = {
  showDashboard,
};
