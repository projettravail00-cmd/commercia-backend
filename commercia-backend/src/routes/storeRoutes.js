const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.post('/onboard', storeController.onboardStore);
router.get('/:id/qr', storeController.getWhatsAppQr);
router.post('/:id/scan', storeController.confirmWhatsAppScan);
router.get('/:id', storeController.getStore);
router.put('/:id', storeController.updateStore);

module.exports = router;
