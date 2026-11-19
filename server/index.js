import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import attendanceRoutes from './routes/attendance.js';

export const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean).map(host => `https://${host}`);
const CLIENT_URLS = (process.env.CLIENT_URL || 'http://127.0.0.1:5173,http://127.0.0.1:4173,http://127.0.0.1:5180,http://localhost:5173,http://localhost:4173,http://localhost:5180')
  .split(',').map(url => url.trim()).filter(Boolean);
CLIENT_URLS.push(...vercelOrigins);

app.use(cors({
  origin(origin, callback) {
    if (!origin || CLIENT_URLS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not permitted by CORS configuration.'));
  }
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => response.json({
  service: 'Attendly Attendance API',
  status: 'ok',
  databaseConnected: mongoose.connection.readyState === 1,
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString()
}));

app.use('/api/attendance', (request, response, next) => {
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({ message: 'Attendance database is not connected. Configure MONGODB_URI and restart the API.' });
  }
  next();
}, attendanceRoutes);

app.use((error, _request, response, _next) => {
  const status = error.code === 11000 || error.name === 'ValidationError' || error.name === 'CastError'
    ? 400
    : error.status || 500;
  response.status(status).json({
    message: error.code === 11000 ? 'A record with the same unique value already exists.' : error.message || 'API error'
  });
});

let databaseConnection;
export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  if (!databaseConnection) {
    databaseConnection = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      .then(() => console.log('Attendly connected to MongoDB.'))
      .catch(error => { databaseConnection = undefined; throw error; });
  }
  return databaseConnection;
}

if (!process.env.VERCEL) {
  connectDatabase().catch(error => console.warn(`MongoDB connection failed: ${error.message}`));
  app.listen(PORT, () => console.log(`Attendly API listening on http://127.0.0.1:${PORT}`));
}
