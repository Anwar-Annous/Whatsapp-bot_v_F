const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const multer = require('multer');
const db = require('../config/db');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = Date.now() + ext;
    cb(null, filename);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mp3', '.ogg'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
}

const upload = multer({ storage, fileFilter });

const indexView = path.join(__dirname, '..', 'views', 'flows', 'index.ejs');
const editorView = path.join(__dirname, '..', 'views', 'flows', 'editor.ejs');
const createView = path.join(__dirname, '..', 'views', 'flows', 'create.ejs');

function listFlows(req, res) {
  const sql = `
    SELECT flows.id AS flowId, flows.account_id AS accountId, accounts.name AS accountName
    FROM flows
    LEFT JOIN accounts ON accounts.id = flows.account_id
  `;

  db.all(sql, (err, rows) => {
    if (err) {
      console.error('Failed to load flows:', err.message);
      rows = [];
    }

    ejs.renderFile(indexView, { flows: rows }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render flows index:', renderErr.message);
        html = '<div class="p-3">Unable to load flows.</div>';
      }

      res.render('layout', {
        title: 'Flows',
        page: 'flows',
        body: html,
      });
    });
  });
}

function showCreateForm(req, res) {
  db.all(`SELECT * FROM accounts`, (err, accounts) => {
    if (err) {
      console.error('Failed to load accounts for flow create:', err.message);
      return res.redirect('/flows');
    }

    ejs.renderFile(createView, { accounts: accounts || [] }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render create flow page:', renderErr.message);
        html = '<div class="p-3">Unable to load create flow page.</div>';
      }

      res.render('layout', {
        title: 'Create Flow',
        page: 'flows',
        body: html,
      });
    });
  });
}

function addFlow(req, res) {
  const accountId = String(req.body.accountId);

  db.get(`SELECT id FROM flows WHERE account_id = ?`, [accountId], (err, flow) => {
    if (err) {
      console.error('Failed to check flow:', err.message);
      return res.redirect('/flows');
    }

    if (flow) {
      return res.redirect(`/flows/${accountId}`);
    }

    db.run(
      `INSERT INTO flows (account_id, json_data) VALUES (?, ?)`,
      [accountId, '[]'],
      () => {
        res.redirect(`/flows/${accountId}`);
      }
    );
  });
}

function showEditor(req, res) {
  const accountId = String(req.params.accountId);

  db.get(`SELECT * FROM accounts WHERE id = ?`, [accountId], (accountErr, account) => {
    if (accountErr || !account) {
      return res.redirect('/flows');
    }

    db.get(`SELECT * FROM flows WHERE account_id = ?`, [accountId], (flowErr, flow) => {
      let mode = 'all';
      let steps = [];
      if (flow && flow.json_data) {
        try {
          const parsed = JSON.parse(flow.json_data);
          if (Array.isArray(parsed)) {
            steps = parsed;
            mode = 'all';
          } else {
            steps = Array.isArray(parsed.steps) ? parsed.steps : [];
            mode = parsed.mode === 'firstTime' ? 'firstTime' : 'all';
          }
        } catch (parseErr) {
          steps = [];
        }
      }

      db.all(`SELECT * FROM media WHERE account_id = ?`, [accountId], (mediaErr, mediaList) => {
        if (mediaErr) {
          mediaList = [];
        }

        ejs.renderFile(
          editorView,
          {
            account,
            flow,
            steps,
            mediaList,
            mode,
          },
          (renderErr, html) => {
            if (renderErr) {
              console.error('Failed to render flow editor:', renderErr.message);
              html = '<div class="p-3">Unable to load flow editor.</div>';
            }

            res.render('layout', {
              title: `Flow Editor for ${account.name}`,
              page: 'flows',
              body: html,
            });
          }
        );
      });
    });
  });
}

function saveFlow(req, res) {
  const accountId = String(req.params.accountId);
  const stepsJson = req.body.steps || '[]';
  const mode = req.body.flowMode === 'firstTime' ? 'firstTime' : 'all';

  let flowData = '[]';
  try {
    const steps = JSON.parse(stepsJson);
    flowData = JSON.stringify({ mode, steps });
  } catch (parseErr) {
    flowData = JSON.stringify({ mode, steps: [] });
  }

  db.get(`SELECT id FROM flows WHERE account_id = ?`, [accountId], (err, flow) => {
    if (err) {
      console.error('Failed to check flow:', err.message);
      return res.redirect(`/flows/${accountId}`);
    }

    if (flow) {
      db.run(
        `UPDATE flows SET json_data = ? WHERE account_id = ?`,
        [flowData, accountId],
        function (updateErr) {
          if (updateErr) {
            console.error('Failed to update flow:', updateErr.message);
          }
          res.redirect(`/flows/${accountId}`);
        }
      );
    } else {
      db.run(
        `INSERT INTO flows (account_id, json_data) VALUES (?, ?)`,
        [accountId, flowData],
        function (insertErr) {
          if (insertErr) {
            console.error('Failed to insert flow:', insertErr.message);
          }
          res.redirect(`/flows/${accountId}`);
        }
      );
    }
  });
}

function uploadStepMedia(req, res) {
  const accountId = String(req.params.accountId);

  upload.single('file')(req, res, (err) => {
    if (err || !req.file) {
      return res.status(400).json({ error: 'Upload failed' });
    }

    db.run(
      `INSERT INTO media (account_id, flow_id, filename, type) VALUES (?, 0, ?, ?)`,
      [accountId, req.file.filename, req.file.mimetype],
      () => {
        res.json({ filename: req.file.filename });
      }
    );
  });
}

function deleteFlow(req, res) {
  const flowId = String(req.params.flowId);

  db.all(`SELECT * FROM media WHERE flow_id = ?`, [flowId], (err, mediaRows) => {
    if (err) {
      console.error('Failed to load media for flow delete:', err.message);
      mediaRows = [];
    }

    mediaRows.forEach((media) => {
      const filePath = path.join(__dirname, '..', 'uploads', media.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    db.serialize(() => {
      db.run(`DELETE FROM media WHERE flow_id = ?`, [flowId]);
      db.run(`DELETE FROM flows WHERE id = ?`, [flowId], () => {
        res.redirect('/flows');
      });
    });
  });
}

module.exports = {
  listFlows,
  showCreateForm,
  showEditor,
  addFlow,
  saveFlow,
  uploadStepMedia,
  deleteFlow,
};
