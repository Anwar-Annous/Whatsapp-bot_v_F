const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.showLogin);
router.post('/login', authController.doLogin);
router.get('/logout', authController.doLogout);

module.exports = router;
