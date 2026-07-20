const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { MessageMedia } = require('whatsapp-web.js');

const DEBUG = true;
function dbg(...args) {
  if (DEBUG) console.log('[BOT-DEBUG]', ...args);
}

function touchAccount(accountId) {
  db.run(
    `UPDATE accounts SET last_activity = datetime('now') WHERE id = ?`,
    [accountId]
  );
}

function handleMessage(accountId, contactPhone, incomingText, client) {
  const normalizedPhone = String(contactPhone);
  dbg('handleMessage', { accountId, normalizedPhone, incomingText });

  function saveIncomingMessage(contact, isNewContact) {
    db.run(
      `INSERT INTO messages (account_id, contact_id, direction, message) VALUES (?, ?, 'in', ?)`,
      [accountId, contact.id, incomingText],
      () => {
        dbg('incoming saved', { accountId, contactId: contact.id, isNewContact });
        touchAccount(accountId);
        loadFlow(contact, isNewContact);
      }
    );
  }

  function loadFlow(contact, isNewContact) {
    dbg('loadFlow start', { accountId, contactId: contact.id, current_step: contact.current_step, isNewContact });
    db.get(`SELECT * FROM flows WHERE account_id = ?`, [accountId], (flowErr, flow) => {
      if (flowErr || !flow) {
        dbg('NO FLOW for account', { accountId, flowErr: flowErr && flowErr.message });
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
        dbg('FLOW PARSE ERROR', { accountId, error: parseErr && parseErr.message });
        return;
      }

      dbg('flow loaded', { accountId, mode, stepsCount: steps.length });

      if (mode === 'firstTime' && contact.current_step === 1 && !isNewContact) {
        dbg('SKIP: firstTime mode + returning contact at step 1', { accountId, contactId: contact.id });
        return;
      }

      const startIndex = Math.max(0, contact.current_step - 1);
      dbg('executeFlow from index', { accountId, startIndex });
      executeFlow(steps, startIndex, contact, client, incomingText);
    });
  }

  function executeFlow(steps, currentIndex, contact, client, lastMessage) {
    if (!Array.isArray(steps) || currentIndex >= steps.length) {
      dbg('executeFlow STOP: no steps / index out of range', { accountId, currentIndex, stepsLen: steps && steps.length });
      return;
    }

    const step = steps[currentIndex];
    if (!step || !step.type) {
      dbg('executeFlow STOP: invalid step', { accountId, currentIndex });
      return;
    }

    dbg('step', { accountId, currentIndex, type: step.type });

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
      dbg('SENDING TEXT', { accountId, normalizedPhone, text: step.text });
      client.sendMessage(normalizedPhone, step.text || '').then(() => {
        dbg('TEXT SENT OK', { accountId, normalizedPhone });
        sendOutgoing(step.text || '');
        nextStep(currentIndex + 1);
      }).catch((sendErr) => {
        dbg('TEXT SEND FAILED', { accountId, normalizedPhone, error: sendErr && sendErr.message });
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
        dbg('MEDIA SENT OK', { accountId, normalizedPhone, filename });
        sendOutgoing(filename);
        nextStep(currentIndex + 1);
      }).catch((sendErr) => {
        dbg('MEDIA SEND FAILED', { accountId, normalizedPhone, filename, error: sendErr && sendErr.message });
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
      dbg('condition', { accountId, lastMessage, value: step.value, matched: lastMessage === step.value, chosen });

      let nextIndex = steps.findIndex((item) => String(item.id) === String(chosen));
      if (nextIndex < 0) {
        const targetNumber = Number(chosen);
        if (!isNaN(targetNumber)) {
          nextIndex = targetNumber - 1;
        }
      }

      dbg('condition jump', { accountId, nextIndex });
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
        dbg('contact lookup ERROR', { accountId, error: contactErr && contactErr.message });
        return;
      }

      if (!contact) {
        dbg('NEW contact (not found in DB)', { accountId, normalizedPhone });
        db.run(
          `INSERT INTO contacts (account_id, phone, current_step) VALUES (?, ?, 1)`,
          [accountId, normalizedPhone],
          function () {
            db.get(
              `SELECT * FROM contacts WHERE id = ?`,
              [this.lastID],
              (newContactErr, newContact) => {
                if (newContactErr || !newContact) {
                  dbg('new contact fetch ERROR', { accountId, error: newContactErr && newContactErr.message });
                  return;
                }
                saveIncomingMessage(newContact, true);
              }
            );
          }
        );
      } else {
        dbg('EXISTING contact', { accountId, contactId: contact.id, current_step: contact.current_step });
        saveIncomingMessage(contact, false);
      }
    }
  );
}

module.exports = {
  handleMessage,
};
