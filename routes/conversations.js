const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversationsController');

router.get('/conversations', conversationsController.listConversations);
router.get('/conversations/:contactId', conversationsController.showChat);

module.exports = router;
