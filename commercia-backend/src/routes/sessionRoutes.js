const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// Routes de gestion de session WhatsApp Baileys
router.get('/qr', sessionController.getQrCode);
router.get('/status', sessionController.getStatus);
router.post('/pairing-code', sessionController.getPairingCode);
router.post('/reset', sessionController.reset);
router.post('/disconnect', sessionController.disconnect);

module.exports = router;
