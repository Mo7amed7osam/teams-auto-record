const mongoose = require('mongoose');

const operationSchema = new mongoose.Schema({
  licenseId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: 'License' 
  },
  operationId: { 
    type: String, 
    required: true 
  },
  operation: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Unique compound index to ensure idempotency per license and operation ID
operationSchema.index({ licenseId: 1, operationId: 1 }, { unique: true });

// TTL index to automatically remove old operation records after 24 hours
// 24 hours * 60 minutes * 60 seconds = 86400 seconds
operationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const Operation = mongoose.model('Operation', operationSchema);

module.exports = Operation;
