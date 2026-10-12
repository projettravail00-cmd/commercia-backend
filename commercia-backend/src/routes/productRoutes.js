const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/:store_id', productController.getProducts);
router.post('/', productController.addProduct);
router.patch('/:id/stock', productController.adjustStock);

module.exports = router;
