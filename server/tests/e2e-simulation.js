const { MongoMemoryServer } = require('mongodb-memory-server');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');

// Set env variables BEFORE requiring app and env to ensure consistency
process.env.LICENSE_HASH_SECRET = 'secret1';
process.env.DEVICE_HASH_SECRET = 'secret2';
process.env.JWT_SECRET = 'secret3';
process.env.ADMIN_API_KEY = 'admin-key';

const app = require('../src/app');
const env = require('../src/config/env');

async function runSimulation() {
  console.log('--- STARTING E2E SIMULATION ---');
  let mongoServer;
  
  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    
    // Set env variables for scripts
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = 'e2e_test';
    process.env.LICENSE_HASH_SECRET = 'secret1';
    process.env.DEVICE_HASH_SECRET = 'secret2';
    process.env.JWT_SECRET = 'secret3';
    process.env.ADMIN_API_KEY = 'admin-key';
    
    env.MONGODB_URI = uri;
    env.MONGODB_DB_NAME = 'e2e_test';
    
    await mongoose.connect(uri, { dbName: 'e2e_test' });

    const serverRoot = path.resolve(__dirname, '..');
    const execOptions = { cwd: serverRoot, env: process.env, encoding: 'utf8' };

    console.log('1. Generating license via Admin Script...');
    const generateOut = execSync('node scripts/generate-license.js --label "Profile Test" --max-runs 10', execOptions);
    
    // Extract key using regex
    const match = generateOut.match(/TAR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    if (!match) throw new Error('Failed to parse generated license key');
    const licenseKey = match[0];
    console.log(`[PASS] License generated: ${licenseKey}`);

    const profileA_Id = crypto.randomUUID();
    const profileB_Id = crypto.randomUUID();

    console.log('\n2. Profile A activates successfully');
    const res1 = await request(app).post('/api/licenses/activate').send({
      licenseKey,
      installationId: profileA_Id
    });
    if (res1.status !== 200 || res1.body.status !== 'activated') throw new Error('Profile A failed to activate');
    console.log('[PASS] Profile A activated');

    console.log('\n3. Profile B is rejected using the same code');
    const res2 = await request(app).post('/api/licenses/activate').send({
      licenseKey,
      installationId: profileB_Id
    });
    if (res2.status !== 403 || res2.body.code !== 'LICENSE_ALREADY_BOUND') throw new Error('Profile B was not rejected');
    console.log('[PASS] Profile B rejected with DEVICE_MISMATCH/LICENSE_ALREADY_BOUND');

    console.log('\n4. Reset the code using Admin Script');
    const resetOut = execSync(`node scripts/reset-license-device.js --license ${licenseKey}`, execOptions);
    if (!resetOut.includes('Successfully unbound')) throw new Error('Reset failed');
    console.log('[PASS] Device binding reset');

    console.log('\n5. Profile B activates successfully');
    const res3 = await request(app).post('/api/licenses/activate').send({
      licenseKey,
      installationId: profileB_Id
    });
    if (res3.status !== 200) throw new Error('Profile B failed to activate after reset');
    console.log('[PASS] Profile B activated successfully');

    console.log('\n6. Profile A is rejected afterward');
    const res4 = await request(app).post('/api/licenses/verify').send({
      licenseKey,
      installationId: profileA_Id,
      operation: 'start_auto_record',
      operationId: crypto.randomUUID()
    });
    if (res4.status !== 403 || res4.body.code !== 'DEVICE_MISMATCH') throw new Error('Profile A was not rejected');
    console.log('[PASS] Profile A rejected properly');

    console.log('\n7. Disabling the license blocks Preview and Start using Admin Script');
    const disableOut = execSync(`node scripts/disable-license.js --license ${licenseKey}`, execOptions);
    if (!disableOut.includes('Successfully disabled')) throw new Error('Disable failed');
    
    const res5 = await request(app).post('/api/licenses/verify').send({
      licenseKey,
      installationId: profileB_Id,
      operation: 'preview_auto_record'
    });
    if (res5.status !== 403 || res5.body.code !== 'LICENSE_DISABLED') throw new Error('Preview was not blocked');
    console.log('[PASS] License disable blocks operations');
    
    console.log('\n8. Start fails safely when backend is unavailable');
    // We simulate backend unavailable by throwing an error in mongoose
    const originalFindOne = mongoose.Model.findOne;
    mongoose.Model.findOne = () => { throw new mongoose.Error('DB Down'); };
    
    const res6 = await request(app).post('/api/licenses/verify').send({
      licenseKey,
      installationId: profileB_Id,
      operation: 'start_auto_record',
      operationId: crypto.randomUUID()
    });
    if (res6.status !== 503 || res6.body.code !== 'SERVER_UNAVAILABLE') throw new Error('Did not fail safely');
    mongoose.Model.findOne = originalFindOne; // Restore
    console.log('[PASS] Backend unavailable fails safely with 503');

    console.log('\n--- SIMULATION COMPLETE ---');

  } catch (error) {
    console.error('SIMULATION ERROR:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  }
}

runSimulation();
