import { sendJson } from '../lib/http.js';

const startedAt = Date.now();

export function registerHealthRoutes(router, { db, getSchemaVersion, config }) {
  router.get('/api/health', async (req, res) => {
    const users = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role != 'system'").get();
    const publicCourses = db.prepare('SELECT COUNT(*) AS count FROM courses WHERE is_public = 1').get();
    sendJson(res, 200, {
      ok: true,
      service: 'dudu-hanngu-fullstack',
      version: '2.0.0',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      schemaVersion: getSchemaVersion(),
      aiServerKeyConfigured: Boolean(config.geminiApiKey),
      stats: {
        learners: Number(users?.count || 0),
        communityCourses: Number(publicCourses?.count || 0),
      },
      timestamp: new Date().toISOString(),
    });
  });
}
