const path = require('path');
const ejs = require('ejs');
const db = require('../config/db');

const conversationsListView = path.join(__dirname, '..', 'views', 'conversations', 'index.ejs');
const conversationsChatView = path.join(__dirname, '..', 'views', 'conversations', 'chat.ejs');

function listConversations(req, res) {
  const sql = `
    SELECT contacts.id AS contactId,
           contacts.phone AS contactPhone,
           accounts.name AS accountName,
           (SELECT message FROM messages WHERE contact_id = contacts.id ORDER BY created_at DESC LIMIT 1) AS lastMessage
    FROM contacts
    LEFT JOIN accounts ON accounts.id = contacts.account_id
    ORDER BY contacts.id DESC
  `;

  db.all(sql, (err, rows) => {
    if (err) {
      console.error('Failed to load conversations:', err.message);
      rows = [];
    }

    ejs.renderFile(conversationsListView, { conversations: rows }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render conversations list:', renderErr.message);
        html = '<div class="p-3">Unable to load conversations.</div>';
      }

      res.render('layout', {
        title: 'Conversations',
        page: 'conversations',
        body: html,
      });
    });
  });
}

function showChat(req, res) {
  const contactId = String(req.params.contactId);

  db.get(`SELECT * FROM contacts WHERE id = ?`, [contactId], (err, contact) => {
    if (err || !contact) {
      return res.redirect('/conversations');
    }

    db.get(`SELECT * FROM accounts WHERE id = ?`, [contact.account_id], (accErr, account) => {
      if (accErr || !account) {
        return res.redirect('/conversations');
      }

      db.all(
        `SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at ASC`,
        [contactId],
        (msgErr, messages) => {
          if (msgErr) {
            messages = [];
          }

          ejs.renderFile(conversationsChatView, { contact, account, messages }, (renderErr, html) => {
            if (renderErr) {
              console.error('Failed to render chat page:', renderErr.message);
              html = '<div class="p-3">Unable to load chat.</div>';
            }

            res.render('layout', {
              title: `Chat with ${contact.phone}`,
              page: 'conversations',
              body: html,
            });
          });
        }
      );
    });
  });
}

module.exports = {
  listConversations,
  showChat,
};
