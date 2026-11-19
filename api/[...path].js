import { app, connectDatabase } from '../server/index.js';

export default async function handler(request, response) {
  try {
    await connectDatabase();
  } catch (error) {
    console.error(`Attendly database connection failed: ${error.message}`);
    return response.status(503).json({
      message: 'Attendance database is not connected. Configure MONGODB_URI in the deployment environment.'
    });
  }

  return app(request, response);
}
