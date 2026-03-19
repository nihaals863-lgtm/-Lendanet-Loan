const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loan.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/', protect, loanController.createLoan);
router.get('/', protect, loanController.getLoans);
router.post('/:id/payment', protect, loanController.addPayment);
router.put('/:id/default', protect, loanController.markDefault);

router.get('/my-loans', protect, loanController.getMyLoans);
router.get('/lender-defaults', protect, loanController.getLenderDefaults);

module.exports = router;
