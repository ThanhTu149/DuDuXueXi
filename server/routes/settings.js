import { decryptSecret, encryptSecret, maskApiKey } from '../lib/crypto.js';
import { ApiError, readJsonBody, safeJsonParse, sendJson } from '../lib/http.js';
import { requireAuth } from './auth.js';

const ALLOWED_THEMES = new Set(['light', 'dark', 'auto']);
const ALLOWED_COLOR_THEMES = new Set(['pastel', 'rose', 'ocean']);

export function getUserSettingsSnapshot(db, config, userId) {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  return {
    activeCourseId: row?.active_course_id || 'hanngu-tap2',
    themeMode: row?.theme_mode || 'auto',
    colorTheme: row?.color_theme || 'pastel',
    geminiModel: row?.gemini_model || 'gemini-flash-latest',
    recentCourseIds: safeJsonParse(row?.recent_course_ids_json, []) || [],
    settings: safeJsonParse(row?.settings_json, {}) || {},
    geminiKeyConfigured: Boolean(row?.gemini_key_enc),
    geminiKeyHint: row?.gemini_key_hint || '',
    serverKeyAvailable: Boolean(config.geminiApiKey),
    updatedAt: row?.updated_at || null,
  };
}

export function resolveEffectiveGeminiKey(db, config, userId, overrideKey = null) {
  if (overrideKey && String(overrideKey).trim()) {
    return { key: String(overrideKey).trim(), source: 'request' };
  }
  if (userId) {
    const row = db.prepare('SELECT gemini_key_enc, gemini_key_iv, gemini_key_tag FROM user_settings WHERE user_id = ?').get(userId);
    if (row?.gemini_key_enc) {
      const decrypted = decryptSecret(row.gemini_key_enc, row.gemini_key_iv, row.gemini_key_tag, config.encryptionSecret);
      if (decrypted) return { key: decrypted, source: 'user' };
    }
  }
  if (config.geminiApiKey) {
    return { key: config.geminiApiKey, source: 'server' };
  }
  return { key: null, source: 'none' };
}

export function registerSettingsRoutes(router, { db, config }) {
  router.get('/api/settings', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    sendJson(res, 200, { ok: true, settings: getUserSettingsSnapshot(db, config, user.id) });
  });

  router.put('/api/settings', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const body = await readJsonBody(req);
    const current = getUserSettingsSnapshot(db, config, user.id);

    const activeCourseId = typeof body.activeCourseId === 'string' && body.activeCourseId.trim()
      ? body.activeCourseId.trim().slice(0, 100)
      : current.activeCourseId;
    const themeMode = ALLOWED_THEMES.has(body.themeMode) ? body.themeMode : current.themeMode;
    const colorTheme = ALLOWED_COLOR_THEMES.has(body.colorTheme) ? body.colorTheme : current.colorTheme;
    const geminiModel = typeof body.geminiModel === 'string' && body.geminiModel.trim()
      ? body.geminiModel.trim().slice(0, 80)
      : current.geminiModel;
    const recentCourseIds = Array.isArray(body.recentCourseIds)
      ? body.recentCourseIds.filter((id) => typeof id === 'string').slice(0, 10)
      : current.recentCourseIds;
    const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
      ? { ...current.settings, ...body.settings }
      : current.settings;

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_settings (
        user_id, active_course_id, theme_mode, color_theme, gemini_model,
        recent_course_ids_json, settings_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        active_course_id = excluded.active_course_id,
        theme_mode = excluded.theme_mode,
        color_theme = excluded.color_theme,
        gemini_model = excluded.gemini_model,
        recent_course_ids_json = excluded.recent_course_ids_json,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `).run(
      user.id,
      activeCourseId,
      themeMode,
      colorTheme,
      geminiModel,
      JSON.stringify(recentCourseIds),
      JSON.stringify(settings),
      now,
    );

    sendJson(res, 200, { ok: true, settings: getUserSettingsSnapshot(db, config, user.id) });
  });

  router.put('/api/settings/gemini-key', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const body = await readJsonBody(req);
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey || apiKey.length < 8 || apiKey.length > 256) {
      throw new ApiError(400, 'invalid_api_key', 'API key Gemini không hợp lệ (cần từ 8 đến 256 ký tự).');
    }

    const { enc, iv, tag } = encryptSecret(apiKey, config.encryptionSecret);
    const hint = maskApiKey(apiKey);
    const now = new Date().toISOString();
    const geminiModel = typeof body.geminiModel === 'string' && body.geminiModel.trim()
      ? body.geminiModel.trim().slice(0, 80)
      : null;

    db.prepare(`
      INSERT INTO user_settings (
        user_id, gemini_key_enc, gemini_key_iv, gemini_key_tag, gemini_key_hint, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        gemini_key_enc = excluded.gemini_key_enc,
        gemini_key_iv = excluded.gemini_key_iv,
        gemini_key_tag = excluded.gemini_key_tag,
        gemini_key_hint = excluded.gemini_key_hint,
        updated_at = excluded.updated_at
    `).run(user.id, enc, iv, tag, hint, now);

    if (geminiModel) {
      db.prepare('UPDATE user_settings SET gemini_model = ? WHERE user_id = ?').run(geminiModel, user.id);
    }

    sendJson(res, 200, {
      ok: true,
      configured: true,
      hint,
      message: 'Đã mã hoá và lưu Gemini API key an toàn trên máy chủ.',
    });
  });

  router.delete('/api/settings/gemini-key', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE user_settings
      SET gemini_key_enc = NULL, gemini_key_iv = NULL, gemini_key_tag = NULL, gemini_key_hint = NULL, updated_at = ?
      WHERE user_id = ?
    `).run(now, user.id);
    sendJson(res, 200, { ok: true, configured: false, hint: '' });
  });
}
