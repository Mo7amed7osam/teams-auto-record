const { ZodError } = require('zod');

function errorHandler(err, req, res, next) {
  // Generate a basic correlation ID for tracing in logs if one isn't provided
  const correlationId = req.headers['x-correlation-id'] || Math.random().toString(36).substring(2, 15);

  // 1. Handle Zod validation errors
  if (err instanceof ZodError) {
    // Only log validation errors in dev/debug mode, or log sparsely
    return res.status(400).json({
      allowed: false,
      code: 'INVALID_REQUEST',
      message: err.errors[0]?.message || 'Invalid request format'
    });
  }

  // 2. Handle known Mongoose/MongoDB errors cleanly without leaking internals
  if (err.name === 'MongoServerError' || err.name === 'MongooseError' || err.name === 'CastError') {
    console.error(`[${correlationId}] Database Error:`, err.message);
    return res.status(503).json({
      allowed: false,
      code: 'SERVER_UNAVAILABLE',
      message: 'Service is temporarily unavailable.'
    });
  }

  // 3. Catch-all for unexpected errors
  // Log the full error to the server console, but NEVER send it to the client
  console.error(`[${correlationId}] Unhandled Exception:`, err);

  return res.status(500).json({
    allowed: false,
    code: 'SERVER_UNAVAILABLE',
    message: 'An unexpected error occurred. Please try again later.'
  });
}

module.exports = errorHandler;
