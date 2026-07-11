const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const db = require('../config/db');
const { clients, qrCodes, createClient, destroyClient, logoutAndCleanup } = require('../config/whatsapp');
const qrcode = require('qrcode');

const STALE_THRESHOLD_MINUTES = 12 * 60;

function formatLastActivity(ts) {
  if (!ts) {
    return { text: 'Never', stale: false };
  }

  const date = new Date(String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(date.getTime())) {
    return { text: ts, stale: false };
  }

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  let text;
  if (minutes < 1) {
    text = 'Just now';
  } else if (minutes < 60) {
    text = minutes + ' min ago';
  } else if (minutes < 1440) {
    text = Math.floor(minutes / 60) + ' hr ago';
  } else {
    text = Math.floor(minutes / 1440) + ' days ago';
  }

  return { text, stale: minutes > STALE_THRESHOLD_MINUTES };
}

const accountsIndexView = path.join(__dirname, '..', 'views', 'accounts', 'index.ejs');
const accountsQrView = path.join(__dirname, '..', 'views', 'accounts', 'qr.ejs');

function listAccounts(req, res) {
  db.all(`SELECT * FROM accounts`, (err, rows) => {
    if (err) {
      console.error('Failed to load accounts:', err.message);
      rows = [];
    }

    const accounts = (rows || []).map((account) => {
      const la = formatLastActivity(account.last_activity);
      return Object.assign({}, account, {
        lastActivityText: la.text,
        lastActivityStale: la.stale,
      });
    });

    ejs.renderFile(accountsIndexView, { accounts }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render accounts page:', renderErr.message);
        html = '<div class="p-3">Unable to load accounts.</div>';
      }

      res.render('layout', {
        title: 'Accounts',
        page: 'accounts',
        body: html,
      });
    });
  });
}

function showAddForm(req, res) {
  res.render('layout', {
    title: 'Add Account',
    page: 'accounts',
    body: `
      <div class="p-3">
        <h2>Add Account</h2>
        <form method="POST" action="/accounts/add">
          <div class="mb-3">
            <label class="form-label">Name</label>
            <input name="name" class="form-control" required />
          </div>
          <div class="mb-3">
            <label class="form-label">Phone</label>
            <input name="phone" class="form-control" required />
          </div>
          <button class="btn btn-success">Create Account</button>
        </form>
      </div>
    `,
  });
}

function addAccount(req, res) {
  const { name, phone } = req.body;
  db.run(
    `INSERT INTO accounts (name, phone, status) VALUES (?, ?, 'disconnected')`,
    [name, phone],
    function (err) {
      if (err) {
        console.error('Failed to add account:', err.message);
        return res.redirect('/accounts');
      }

      const newId = this.lastID;
      createClient({ id: newId, name, phone });
      res.redirect('/accounts');
    }
  );
}

function showQR(req, res) {
  const accountId = String(req.params.id);
  db.get(`SELECT * FROM accounts WHERE id = ?`, [accountId], (err, account) => {
    if (err || !account) {
      return res.redirect('/accounts');
    }

    const qrString = qrCodes[accountId] || null;

    function renderQrPage(qrDataURL) {
      ejs.renderFile(
        accountsQrView,
        { account, qrDataURL, status: account.status },
        (renderErr, html) => {
          if (renderErr) {
            console.error('Failed to render qr page:', renderErr.message);
            html = '<div class="p-3">Unable to load QR page.</div>';
          }

          res.render('layout', {
            title: 'QR Code',
            page: 'accounts',
            body: html,
          });
        }
      );
    }

    if (qrString) {
      qrcode.toDataURL(qrString, (qrcodeErr, url) => {
        if (qrcodeErr) {
          console.error('QR generation failed:', qrcodeErr.message);
          return renderQrPage(null);
        }
        renderQrPage(url);
      });
    } else {
      renderQrPage(null);
    }
  });
}

function reconnectAccount(req, res) {
  const accountId = String(req.params.id);
  db.get(`SELECT * FROM accounts WHERE id = ?`, [accountId], (err, account) => {
    if (err || !account) {
      return res.redirect('/accounts');
    }

    destroyClient(accountId);
    createClient(account);
    res.redirect(`/accounts/${accountId}/qr`);
  });
}

function disconnectAccount(req, res) {
  const accountId = String(req.params.id);
  logoutAndCleanup(accountId)
    .catch((err) => {
      console.error(`disconnect cleanup failed for account ${accountId}:`, err && err.message);
    })
    .finally(() => {
      db.run(
        `UPDATE accounts SET status = 'disconnected' WHERE id = ?`,
        [accountId],
        () => {
          res.redirect('/accounts');
        }
      );
    });
}

function deleteAccount(req, res) {
  const accountId = String(req.params.id);

  const finish = () => {
    db.serialize(() => {
      db.run(`DELETE FROM accounts WHERE id = ?`, [accountId]);
      db.run(`DELETE FROM contacts WHERE account_id = ?`, [accountId]);
      db.run(`DELETE FROM messages WHERE account_id = ?`, [accountId]);
      db.run(`DELETE FROM flows WHERE account_id = ?`, [accountId]);
      db.run(`DELETE FROM media WHERE account_id = ?`, [accountId], () => {
        res.redirect('/accounts');
      });
    });
  };

  db.all(`SELECT filename FROM media WHERE account_id = ?`, [accountId], (err, mediaRows) => {
    if (!err && Array.isArray(mediaRows)) {
      mediaRows.forEach((row) => {
        if (row.filename) {
          const filePath = path.join(__dirname, '..', 'uploads', String(row.filename));
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (fileErr) {
            console.error(`Failed to delete media file ${filePath}:`, fileErr && fileErr.message);
          }
        }
      });
    }

    logoutAndCleanup(accountId)
      .catch((cleanupErr) => {
        console.error(`delete cleanup failed for account ${accountId}:`, cleanupErr && cleanupErr.message);
      })
      .finally(finish);
  });
}

function renameAccount(req, res) {
  const accountId = String(req.params.id);
  const { name } = req.body;
  db.run(
    `UPDATE accounts SET name = ? WHERE id = ?`,
    [name, accountId],
    () => {
      res.redirect('/accounts');
    }
  );
}

module.exports = {
  listAccounts,
  showAddForm,
  addAccount,
  showQR,
  reconnectAccount,
  disconnectAccount,
  deleteAccount,
  renameAccount,
};
