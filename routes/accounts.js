const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accountsController');

router.get('/accounts', accountsController.listAccounts);
router.get('/accounts/add', accountsController.showAddForm);
router.post('/accounts/add', accountsController.addAccount);
router.get('/accounts/:id/qr', accountsController.showQR);
router.post('/accounts/:id/reconnect', accountsController.reconnectAccount);
router.post('/accounts/:id/disconnect', accountsController.disconnectAccount);
router.post('/accounts/:id/delete', accountsController.deleteAccount);
router.post('/accounts/:id/rename', accountsController.renameAccount);

module.exports = router;
