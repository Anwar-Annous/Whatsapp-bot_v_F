const path = require('path');
const ejs = require('ejs');
const db = require('../config/db');

const contactsView = path.join(__dirname, '..', 'views', 'contacts', 'index.ejs');
const contactEditView = path.join(__dirname, '..', 'views', 'contacts', 'edit.ejs');

function listContacts(req, res) {
  const search = (req.query.search || '').trim();
  const searchSql = search
    ? `WHERE contacts.phone LIKE '%' || ? || '%' OR contacts.name LIKE '%' || ? || '%'`
    : '';

  const sql = `
    SELECT contacts.id AS contactId,
           contacts.phone,
           contacts.name,
           contacts.created_at AS createdAt,
           accounts.id AS accountId,
           accounts.name AS accountName
    FROM contacts
    LEFT JOIN accounts ON accounts.id = contacts.account_id
    ${searchSql}
    ORDER BY accounts.name, contacts.name, contacts.phone
  `;

  const params = search ? [search, search] : [];
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Failed to load contacts:', err.message);
      rows = [];
    }

    ejs.renderFile(contactsView, { contacts: rows, search }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render contacts page:', renderErr.message);
        html = '<div class="p-3">Unable to load contacts.</div>';
      }

      res.render('layout', {
        title: 'Contacts',
        page: 'contacts',
        body: html,
      });
    });
  });
}

function editContactForm(req, res) {
  const contactId = String(req.params.contactId);

  db.get(`SELECT * FROM contacts WHERE id = ?`, [contactId], (err, contact) => {
    if (err || !contact) {
      return res.redirect('/contacts');
    }

    ejs.renderFile(contactEditView, { contact }, (renderErr, html) => {
      if (renderErr) {
        console.error('Failed to render edit contact page:', renderErr.message);
        html = '<div class="p-3">Unable to load edit contact.</div>';
      }

      res.render('layout', {
        title: 'Edit Contact',
        page: 'contacts',
        body: html,
      });
    });
  });
}

function updateContact(req, res) {
  const contactId = String(req.params.contactId);
  const name = req.body.name ? req.body.name.trim() : null;

  db.run(`UPDATE contacts SET name = ? WHERE id = ?`, [name, contactId], () => {
    res.redirect('/contacts');
  });
}

function deleteContact(req, res) {
  const contactId = String(req.params.contactId);

  db.run(`DELETE FROM contacts WHERE id = ?`, [contactId], () => {
    res.redirect('/contacts');
  });
}

module.exports = {
  listContacts,
  editContactForm,
  updateContact,
  deleteContact,
};
