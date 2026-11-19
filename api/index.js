import { app, connectDatabase } from '../server/index.js';

export default async function handler(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const path = url.searchParams.get('__path');

  if (!path) {
    return response.status(404).json({ message: 'API route not found.' });
  }

  url.searchParams.delete('__path');
  request.url = `/api/${path}${url.search}`;

  try {
    await connectDatabase();
  } catch (error) {
    console.error(`Attendly database connection failed: ${error.message}`);
    return response.status(503).json({
      message: 'Attendance database is not connected. Check the deployment database configuration.'
    });
  }

  return app(request, response);
}
