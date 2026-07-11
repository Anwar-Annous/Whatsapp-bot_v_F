const express = require('express');
const router = express.Router();
const flowsController = require('../controllers/flowsController');

router.get('/flows', flowsController.listFlows);
router.get('/flows/add', flowsController.showCreateForm);
router.post('/flows/add', flowsController.addFlow);
router.get('/flows/:accountId', flowsController.showEditor);
router.post('/flows/:accountId/save', flowsController.saveFlow);
router.post('/flows/:accountId/upload-media', flowsController.uploadStepMedia);
router.post('/flows/:flowId/delete', flowsController.deleteFlow);

module.exports = router;
