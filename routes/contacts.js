const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');

router.get('/contacts', contactsController.listContacts);
router.get('/contacts/:contactId/edit', contactsController.editContactForm);
router.post('/contacts/:contactId/update', contactsController.updateContact);
router.post('/contacts/:contactId/delete', contactsController.deleteContact);

module.exports = router;
