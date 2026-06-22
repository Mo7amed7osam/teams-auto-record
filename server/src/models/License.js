const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
  licenseKeyHash: { 
    type: String, 
    required: true, 
    unique: true 
  },
  displayLabel: { 
    type: String, 
    default: '' 
  },
  status: { 
    type: String, 
    enum: ['active', 'disabled', 'expired'], 
    default: 'active' 
  },
  boundDeviceIdHash: { 
    type: String, 
    default: null 
  },
  activatedAt: { 
    type: Date, 
    default: null 
  },
  lastVerifiedAt: { 
    type: Date, 
    default: null 
  },
  expiresAt: { 
    type: Date, 
    default: null 
  },
  maxRuns: { 
    type: Number, 
    default: null 
  },
  runCount: { 
    type: Number, 
    default: 0 
  },
  allowedVersions: { 
    type: [String], 
    default: [] 
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for fast querying during activation and verification
licenseSchema.index({ status: 1 });
licenseSchema.index({ expiresAt: 1 });
licenseSchema.index({ boundDeviceIdHash: 1 });

const License = mongoose.model('License', licenseSchema);

module.exports = License;
