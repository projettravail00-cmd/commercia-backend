const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');

router.get('/whatsapp', botController.verifyMetaWebhook);
router.post('/whatsapp', botController.handleWhatsAppWebhook);

module.exports = router;
