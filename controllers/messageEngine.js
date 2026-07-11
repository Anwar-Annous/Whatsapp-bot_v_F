const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { MessageMedia } = require('whatsapp-web.js');

function touchAccount(accountId) {
  db.run(
    `UPDATE accounts SET last_activity = datetime('now') WHERE id = ?`,
    [accountId]
  );
}

function handleMessage(accountId, contactPhone, incomingText, client) {
  const normalizedPhone = String(contactPhone);

  function saveIncomingMessage(contact, isNewContact) {
    db.run(
      `INSERT INTO messages (account_id, contact_id, direction, message) VALUES (?, ?, 'in', ?)`,
      [accountId, contact.id, incomingText],
      () => {
        touchAccount(accountId);
        loadFlow(contact, isNewContact);
      }
    );
  }

  function loadFlow(contact, isNewContact) {
    db.get(`SELECT * FROM flows WHERE account_id = ?`, [accountId], (flowErr, flow) => {
      if (flowErr || !flow) {
        return;
      }

      let mode = 'all';
      let steps = [];
      try {
        const parsed = JSON.parse(flow.json_data || '{}');
        if (Array.isArray(parsed)) {
          steps = parsed;
          mode = 'all';
        } else {
          steps = Array.isArray(parsed.steps) ? parsed.steps : [];
          mode = parsed.mode === 'firstTime' ? 'firstTime' : 'all';
        }
      } catch (parseErr) {
        return;
      }

      if (mode === 'firstTime' && contact.current_step === 1 && !isNewContact) {
        return;
      }

      const startIndex = Math.max(0, contact.current_step - 1);
      executeFlow(steps, startIndex, contact, client, incomingText);
    });
  }

  function executeFlow(steps, currentIndex, contact, client, lastMessage) {
    if (!Array.isArray(steps) || currentIndex >= steps.length) {
      return;
    }

    const step = steps[currentIndex];
    if (!step || !step.type) {
      return;
    }

    function sendOutgoing(text) {
      db.run(
        `INSERT INTO messages (account_id, contact_id, direction, message) VALUES (?, ?, 'out', ?)`,
        [accountId, contact.id, text]
      );
      touchAccount(accountId);
    }

    function nextStep(index) {
      executeFlow(steps, index, contact, client, lastMessage);
    }

    if (step.type === 'sendText') {
      client.sendMessage(normalizedPhone, step.text || '').then(() => {
        sendOutgoing(step.text || '');
        nextStep(currentIndex + 1);
      }).catch(() => {
        nextStep(currentIndex + 1);
      });
      return;
    }

    if (step.type === 'sendImage' || step.type === 'sendVideo' || step.type === 'sendAudio') {
      const filename = step.filename;
      if (!filename) {
        console.warn(`Flow step ${currentIndex + 1} (account ${accountId}): missing media filename, skipping.`);
        nextStep(currentIndex + 1);
        return;
      }

      const filePath = path.join(__dirname, '..', 'uploads', String(filename));
      if (!fs.existsSync(filePath)) {
        console.warn(`Flow step ${currentIndex + 1} (account ${accountId}): media file not found (${filename}), skipping.`);
        nextStep(currentIndex + 1);
        return;
      }

      let media;
      try {
        media = MessageMedia.fromFilePath(filePath);
      } catch (mediaErr) {
        console.warn(`Flow step ${currentIndex + 1} (account ${accountId}): failed to load media (${filename}), skipping.`);
        nextStep(currentIndex + 1);
        return;
      }

      client.sendMessage(normalizedPhone, media).then(() => {
        sendOutgoing(filename);
        nextStep(currentIndex + 1);
      }).catch(() => {
        nextStep(currentIndex + 1);
      });
      return;
    }

    if (step.type === 'delay') {
      const delayMs = Number(step.seconds) * 1000;
      setTimeout(() => {
        nextStep(currentIndex + 1);
      }, isNaN(delayMs) ? 0 : delayMs);
      return;
    }

    if (step.type === 'waitReply') {
      db.run(
        `UPDATE contacts SET current_step = ? WHERE id = ?`,
        [currentIndex + 2, contact.id]
      );
      return;
    }

    if (step.type === 'stop') {
      return;
    }

    if (step.type === 'condition') {
      const chosen = lastMessage === step.value ? step.nextStep : step.elseStep;

      let nextIndex = steps.findIndex((item) => String(item.id) === String(chosen));
      if (nextIndex < 0) {
        const targetNumber = Number(chosen);
        if (!isNaN(targetNumber)) {
          nextIndex = targetNumber - 1;
        }
      }

      if (nextIndex >= 0 && nextIndex < steps.length) {
        nextStep(nextIndex);
      } else {
        nextStep(currentIndex + 1);
      }
      return;
    }

    if (step.type === 'end') {
      db.run(`UPDATE contacts SET current_step = 1 WHERE id = ?`, [contact.id]);
      return;
    }

    nextStep(currentIndex + 1);
  }

  db.get(
    `SELECT * FROM contacts WHERE account_id = ? AND phone = ?`,
    [accountId, normalizedPhone],
    (contactErr, contact) => {
      if (contactErr) {
        return;
      }

      if (!contact) {
        db.run(
          `INSERT INTO contacts (account_id, phone, current_step) VALUES (?, ?, 1)`,
          [accountId, normalizedPhone],
          function () {
            db.get(
              `SELECT * FROM contacts WHERE id = ?`,
              [this.lastID],
              (newContactErr, newContact) => {
                if (newContactErr || !newContact) {
                  return;
                }
                saveIncomingMessage(newContact, true);
              }
            );
          }
        );
      } else {
        saveIncomingMessage(contact, false);
      }
    }
  );
}

module.exports = {
  handleMessage,
};
