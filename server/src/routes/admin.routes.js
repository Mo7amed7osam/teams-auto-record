'use strict';

const { Router } = require('express');
const adminAuth = require('../middleware/admin-auth');
const { adminLimiter } = require('../middleware/rate-limit');
const {
  handleResetDevice,
  handleDisable,
  handleEnable,
  handleInspect,
} = require('../controllers/admin.controller');

const router = Router();

// All admin routes require API key auth and are rate-limited
router.use(adminAuth);
router.use(adminLimiter);

router.post('/licenses/reset-device', handleResetDevice);
router.post('/licenses/disable', handleDisable);
router.post('/licenses/enable', handleEnable);
router.post('/licenses/inspect', handleInspect);

module.exports = router;
