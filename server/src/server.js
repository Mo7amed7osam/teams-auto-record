const app = require('./app');
const { connectDatabase } = require('./config/database');
const env = require('./config/env');

async function startServer() {
  try {
    // 1. Connect to Database
    await connectDatabase();

    // 2. Start HTTP Server
    const server = app.listen(env.PORT, () => {
      console.log(`Licensing API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });

    // 3. Graceful Shutdown handling
    const gracefulShutdown = () => {
      console.log('Received kill signal, shutting down gracefully.');
      server.close(async () => {
        console.log('Closed out remaining connections.');
        const { disconnectDatabase } = require('./config/database');
        await disconnectDatabase();
        process.exit(0);
      });

      // If after 10s we haven't exited, force exit
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
