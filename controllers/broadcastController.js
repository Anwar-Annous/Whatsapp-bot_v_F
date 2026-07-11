const path = require('path');
const ejs = require('ejs');
const db = require('../config/db');
const { clients } = require('../config/whatsapp');
const { MessageMedia } = require('whatsapp-web.js');

const broadcastView = path.join(__dirname, '..', 'views', 'broadcast', 'index.ejs');
const broadcastStatus = {};

function showBroadcastForm(req, res) {
  db.all(`SELECT * FROM accounts`, (err, accounts) => {
    if (err) {
      console.error('Failed to load accounts for broadcast:', err.message);
      accounts = [];
    }

    ejs.renderFile(broadcastView, { accounts }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render broadcast page:', renderErr.message);
        html = '<div class="p-3">Unable to load broadcast page.</div>';
      }

      res.render('layout', {
        title: 'Broadcast',
        page: 'broadcast',
        body: html,
      });
    });
  });
}

function sendBroadcast(req, res) {
  const accountId = String(req.body.accountId);
  const text = req.body.message || '';
  const file = req.file || null;

  db.all(`SELECT * FROM contacts WHERE account_id = ?`, [accountId], (err, contacts) => {
    if (err) {
      console.error('Failed to load contacts:', err.message);
      return res.status(500).json({ error: 'Unable to load contacts.' });
    }

    db.get(`SELECT * FROM accounts WHERE id = ?`, [accountId], (accErr, account) => {
      if (accErr || !account) {
        return res.status(400).json({ error: 'Invalid account selected.' });
      }

      const client = clients[accountId];
      if (!client) {
        return res.status(400).json({ error: 'Selected account is not connected.' });
      }

      const id = String(Date.now() + Math.random());
      broadcastStatus[id] = {
        total: contacts.length,
        sent: 0,
        failed: [],
        current: 0,
        done: false,
        message: 'Starting broadcast...',
      };

      function processBroadcast(index) {
        if (index >= contacts.length) {
          broadcastStatus[id].done = true;
          broadcastStatus[id].message = `Broadcast completed successfully.`;
          return;
        }

        const contact = contacts[index];
        const number = String(contact.phone);
        const transport = file
          ? MessageMedia.fromFilePath(file.path)
          : text;

        const sendPromise = file ? client.sendMessage(number, transport) : client.sendMessage(number, transport);

        sendPromise
          .then(() => {
            broadcastStatus[id].sent += 1;
            broadcastStatus[id].message = `Sent to ${contact.phone}`;
          })
          .catch(() => {
            broadcastStatus[id].failed.push(contact.phone);
            broadcastStatus[id].message = `Failed to send to ${contact.phone}`;
          })
          .finally(() => {
            broadcastStatus[id].current = index + 1;
            setTimeout(() => processBroadcast(index + 1), 3500);
          });
      }

      if (contacts.length === 0) {
        broadcastStatus[id].done = true;
        broadcastStatus[id].message = 'No contacts found for selected account.';
      } else {
        processBroadcast(0);
      }

      res.json({ broadcastId: id });
    });
  });
}

function getBroadcastStatus(req, res) {
  const statusId = String(req.params.id);
  const status = broadcastStatus[statusId];
  if (!status) {
    return res.status(404).json({ error: 'Status not found.' });
  }

  res.json({
    total: status.total,
    sent: status.sent,
    failed: status.failed,
    current: status.current,
    done: status.done,
    message: status.message,
  });
}

module.exports = {
  showBroadcastForm,
  sendBroadcast,
  getBroadcastStatus,
};
