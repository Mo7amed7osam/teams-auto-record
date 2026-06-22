const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/license.controller');
const { activationLimiter, verificationLimiter } = require('../middleware/rate-limit');

router.post('/activate', activationLimiter, licenseController.handleActivation);
router.post('/verify', verificationLimiter, licenseController.handleVerification);

module.exports = router;
