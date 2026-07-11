const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const broadcastController = require('../controllers/broadcastController');

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

router.get('/broadcast', broadcastController.showBroadcastForm);
router.post('/broadcast/send', upload.single('media'), broadcastController.sendBroadcast);
router.get('/broadcast/status/:id', broadcastController.getBroadcastStatus);

module.exports = router;
