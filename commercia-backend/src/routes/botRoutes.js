const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');

router.post('/whatsapp', botController.handleWhatsAppWebhook);

module.exports = router;
