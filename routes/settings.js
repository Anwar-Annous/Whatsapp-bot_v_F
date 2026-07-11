const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

router.get('/settings', settingsController.showSettings);
router.post('/settings', settingsController.updatePassword);

module.exports = router;
