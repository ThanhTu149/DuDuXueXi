import { randomUUID } from 'node:crypto';
import { generateShareCode } from '../lib/crypto.js';
import { ApiError, readJsonBody, safeJsonParse, sanitizeDeep, sendJson } from '../lib/http.js';
import { requireAuth } from './auth.js';

const BUILT_IN_COURSE_ID = 'hanngu-tap2';

function summarizeCourse(row) {
  const metadata = safeJsonParse(row.metadata_json, {}) || {};
  const chapters = safeJsonParse(row.chapters_json, []) || [];
  const tags = safeJsonParse(row.tags_json, []) || [];
  const totalEntries = metadata.totalEntries ?? chapters.reduce((s, ch) => s + (ch?.glossary?.entries?.length || 0), 0);
  const totalQuestions = metadata.totalQuestions ?? chapters.reduce((s, ch) => s + (ch?.quiz?.questions?.length || 0), 0);
  return {
    id: row.id,
    ownerId: row.owner_id,
    authorName: row.author_name || 'Học viên DuDu',
    authorUsername: row.author_username || null,
    name: row.name,
    description: row.description || '',
    type: row.type,
    status: row.status,
    rawDocumentId: row.raw_document_id || null,
    chapterCount: chapters.length,
    totalEntries,
    totalQuestions,
    metadata: { ...metadata, totalBai: chapters.length, totalEntries, totalQuestions },
    isPublic: Boolean(row.is_public),
    shareCode: row.share_code || null,
    tags,
    cloneCount: Number(row.clone_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fullCourse(row) {
  const summary = summarizeCourse(row);
  return {
    ...summary,
    chapters: safeJsonParse(row.chapters_json, []) || [],
  };
}

function validateCoursePayload(body, courseId) {
  if (!courseId || courseId.length > 120) {
    throw new ApiError(400, 'invalid_course_id', 'Mã khóa học không hợp lệ.');
  }
  if (courseId === BUILT_IN_COURSE_ID) {
    throw new ApiError(400, 'built_in_immutable', 'Không ghi đè khóa học mặc định qua endpoint khóa học tùy chỉnh.');
  }
  const name = String(body.name || '').trim();
  if (!name || name.length > 120) {
    throw new ApiError(400, 'invalid_name', 'Tên khóa học cần từ 1 đến 120 ký tự.');
  }
  const chapters = Array.isArray(body.chapters) ? sanitizeDeep(body.chapters) : [];
  const description = String(body.description || '').trim().slice(0, 600);
  const type = ['imported', 'community'].includes(body.type) ? body.type : 'imported';
  const status = ['empty', 'has-raw', 'processing', 'paused', 'review', 'ready'].includes(body.status)
    ? body.status
    : (chapters.length ? 'ready' : 'empty');
  const rawDocumentId = body.rawDocumentId ? String(body.rawDocumentId).slice(0, 120) : null;
  const tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.map((t) => String(t || '').trim().slice(0, 28)).filter(Boolean))].slice(0, 6)
    : [];
  const baseMeta = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? sanitizeDeep(body.metadata)
    : {};
  const metadata = {
    ...baseMeta,
    totalBai: chapters.length,
    totalEntries: chapters.reduce((s, ch) => s + (ch?.glossary?.entries?.length || 0), 0),
    totalQuestions: chapters.reduce((s, ch) => s + (ch?.quiz?.questions?.length || 0), 0),
  };

  return { name, description, type, status, rawDocumentId, metadata, chapters, tags };
}

export function registerCourseRoutes(router, { db }) {
  // Danh sách khóa học cá nhân của người dùng
  router.get('/api/courses', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const rows = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c
      JOIN users u ON u.id = c.owner_id
      WHERE c.owner_id = ?
      ORDER BY c.updated_at DESC
    `).all(user.id);
    sendJson(res, 200, { ok: true, courses: rows.map(summarizeCourse) });
  });

  // Đọc chi tiết 1 khóa học (chủ sở hữu hoặc khóa công khai)
  router.get('/api/courses/:id', async (req, res, ctx) => {
    const row = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c
      JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `).get(ctx.params.id);

    if (!row) throw new ApiError(404, 'not_found', 'Không tìm thấy khóa học.');
    const isOwner = ctx.auth?.user?.id === row.owner_id;
    if (!row.is_public && !isOwner) {
      throw new ApiError(ctx.auth?.user ? 403 : 401, 'forbidden', 'Bạn không có quyền xem khóa học riêng tư này.');
    }
    sendJson(res, 200, { ok: true, course: fullCourse(row) });
  });

  // Tạo mới hoặc cập nhật khóa học của chính người dùng
  router.put('/api/courses/:id', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const courseId = String(ctx.params.id || '').trim();
    const body = await readJsonBody(req, { maxBytes: 20 * 1024 * 1024 });
    const data = validateCoursePayload(body, courseId);

    const existing = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (existing && existing.owner_id !== user.id) {
      throw new ApiError(403, 'forbidden', 'Không thể chỉnh sửa khóa học thuộc người dùng khác.');
    }

    const now = new Date().toISOString();
    if (existing) {
      const nextTags = body.tags !== undefined ? data.tags : (safeJsonParse(existing.tags_json, []) || []);
      db.prepare(`
        UPDATE courses
        SET name = ?, description = ?, type = ?, status = ?, raw_document_id = ?,
            metadata_json = ?, chapters_json = ?, tags_json = ?, updated_at = ?
        WHERE id = ? AND owner_id = ?
      `).run(
        data.name,
        data.description,
        data.type,
        data.status,
        data.rawDocumentId,
        JSON.stringify(data.metadata),
        JSON.stringify(data.chapters),
        JSON.stringify(nextTags),
        now,
        courseId,
        user.id,
      );
    } else {
      db.prepare(`
        INSERT INTO courses (
          id, owner_id, name, description, type, status, raw_document_id,
          metadata_json, chapters_json, is_public, share_code, tags_json, clone_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 0, ?, ?)
      `).run(
        courseId,
        user.id,
        data.name,
        data.description,
        data.type,
        data.status,
        data.rawDocumentId,
        JSON.stringify(data.metadata),
        JSON.stringify(data.chapters),
        JSON.stringify(data.tags),
        now,
        now,
      );
    }

    const saved = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `).get(courseId);
    sendJson(res, existing ? 200 : 201, { ok: true, course: fullCourse(saved) });
  });

  // Xóa khóa học của người dùng (cascade raw_documents + xóa tiến độ khóa đó)
  router.delete('/api/courses/:id', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const courseId = String(ctx.params.id || '').trim();
    if (courseId === BUILT_IN_COURSE_ID) {
      throw new ApiError(400, 'built_in_protected', 'Không thể xóa khóa học mặc định.');
    }
    const existing = db.prepare('SELECT id, owner_id FROM courses WHERE id = ?').get(courseId);
    if (!existing) throw new ApiError(404, 'not_found', 'Không tìm thấy khóa học.');
    if (existing.owner_id !== user.id) {
      throw new ApiError(403, 'forbidden', 'Bạn không có quyền xóa khóa học này.');
    }
    db.prepare('DELETE FROM courses WHERE id = ? AND owner_id = ?').run(courseId, user.id);
    db.prepare('DELETE FROM user_progress WHERE user_id = ? AND course_id = ?').run(user.id, courseId);
    sendJson(res, 200, { ok: true, deleted: true, id: courseId });
  });

  // Đồng bộ tài liệu gốc + checkpoint xử lý AI của khóa học
  router.get('/api/courses/:id/raw-document', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const row = db.prepare(`
      SELECT doc_json, updated_at FROM raw_documents
      WHERE course_id = ? AND owner_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `).get(ctx.params.id, user.id);
    sendJson(res, 200, {
      ok: true,
      document: row ? safeJsonParse(row.doc_json, null) : null,
      updatedAt: row?.updated_at || null,
    });
  });

  router.put('/api/courses/:id/raw-document', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const courseId = String(ctx.params.id || '').trim();
    const course = db.prepare('SELECT id, owner_id FROM courses WHERE id = ?').get(courseId);
    if (!course) throw new ApiError(404, 'not_found', 'Không tìm thấy khóa học để gắn tài liệu.');
    if (course.owner_id !== user.id) throw new ApiError(403, 'forbidden', 'Không có quyền cập nhật tài liệu khóa học này.');

    const body = await readJsonBody(req, { maxBytes: 25 * 1024 * 1024 });
    const doc = sanitizeDeep(body.document && typeof body.document === 'object' ? body.document : body);
    const docId = String(doc.id || `doc-${randomUUID()}`).slice(0, 120);
    const now = new Date().toISOString();

    db.prepare('DELETE FROM raw_documents WHERE course_id = ? AND owner_id = ? AND id != ?').run(courseId, user.id, docId);
    db.prepare(`
      INSERT INTO raw_documents (id, owner_id, course_id, file_name, file_size, file_type, status, doc_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        file_type = excluded.file_type,
        status = excluded.status,
        doc_json = excluded.doc_json,
        updated_at = excluded.updated_at
    `).run(
      docId,
      user.id,
      courseId,
      String(doc.fileName || '').slice(0, 200),
      Math.max(0, Number(doc.fileSize) || 0),
      String(doc.fileType || 'txt').slice(0, 16),
      String(doc.status || 'chunked').slice(0, 32),
      JSON.stringify({ ...doc, id: docId, courseId }),
      now,
      now,
    );
    db.prepare('UPDATE courses SET raw_document_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?').run(docId, now, courseId, user.id);

    sendJson(res, 200, { ok: true, id: docId, updatedAt: now });
  });

  // Chia sẻ / ẩn khóa học lên Kho Cộng Đồng
  router.post('/api/courses/:id/publish', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const courseId = String(ctx.params.id || '').trim();
    const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!row) throw new ApiError(404, 'not_found', 'Không tìm thấy khóa học.');
    if (row.owner_id !== user.id) throw new ApiError(403, 'forbidden', 'Bạn chỉ có thể chia sẻ khóa học của mình.');

    const body = await readJsonBody(req);
    const isPublic = body.isPublic !== false;
    const chapters = safeJsonParse(row.chapters_json, []) || [];
    if (isPublic && !chapters.length) {
      throw new ApiError(400, 'empty_course', 'Khóa học cần có ít nhất 1 bài học trước khi chia sẻ lên cộng đồng.');
    }

    const description = body.description !== undefined
      ? String(body.description).trim().slice(0, 600)
      : (row.description || '');
    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.map((t) => String(t || '').trim().slice(0, 28)).filter(Boolean))].slice(0, 6)
      : (safeJsonParse(row.tags_json, []) || []);
    const shareCode = isPublic ? (row.share_code || generateShareCode()) : row.share_code;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE courses
      SET is_public = ?, description = ?, tags_json = ?, share_code = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(isPublic ? 1 : 0, description, JSON.stringify(tags), shareCode, now, courseId, user.id);

    const updated = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `).get(courseId);
    sendJson(res, 200, { ok: true, course: summarizeCourse(updated) });
  });

  // Kho khóa học cộng đồng (ai cũng có thể duyệt và tìm kiếm)
  router.get('/api/community/courses', async (req, res, ctx) => {
    const q = String(ctx.query.get('q') || '').trim().toLowerCase();
    const tag = String(ctx.query.get('tag') || '').trim().toLowerCase();
    const sort = ctx.query.get('sort') === 'newest' ? 'newest' : 'popular';
    const orderBy = sort === 'newest' ? 'c.updated_at DESC' : 'c.clone_count DESC, c.updated_at DESC';

    const rows = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c
      JOIN users u ON u.id = c.owner_id
      WHERE c.is_public = 1
      ORDER BY ${orderBy}
      LIMIT 100
    `).all();

    let items = rows.map(summarizeCourse);
    if (q) {
      items = items.filter((item) => (
        item.name.toLowerCase().includes(q)
        || item.description.toLowerCase().includes(q)
        || item.authorName.toLowerCase().includes(q)
        || (item.shareCode || '').toLowerCase() === q
        || item.tags.some((t) => t.toLowerCase().includes(q))
      ));
    }
    if (tag) {
      items = items.filter((item) => item.tags.some((t) => t.toLowerCase() === tag));
    }

    const allTags = [...new Set(rows.flatMap((r) => safeJsonParse(r.tags_json, []) || []))].slice(0, 20);
    sendJson(res, 200, { ok: true, courses: items, tags: allTags });
  });

  // Xem trước khóa học cộng đồng
  router.get('/api/community/courses/:id', async (req, res, ctx) => {
    const key = String(ctx.params.id || '').trim();
    const row = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c
      JOIN users u ON u.id = c.owner_id
      WHERE (c.id = ? OR UPPER(c.share_code) = UPPER(?)) AND c.is_public = 1
    `).get(key, key);
    if (!row) throw new ApiError(404, 'not_found', 'Không tìm thấy khóa học cộng đồng.');
    sendJson(res, 200, { ok: true, course: fullCourse(row) });
  });

  // Nhân bản (clone) khóa học từ cộng đồng về thư viện của người học
  router.post('/api/community/courses/:id/clone', async (req, res, ctx) => {
    const key = String(ctx.params.id || '').trim();
    const source = db.prepare(`
      SELECT c.*, u.display_name AS author_name, u.username AS author_username
      FROM courses c
      JOIN users u ON u.id = c.owner_id
      WHERE (c.id = ? OR UPPER(c.share_code) = UPPER(?)) AND c.is_public = 1
    `).get(key, key);
    if (!source) throw new ApiError(404, 'not_found', 'Không tìm thấy khóa học cộng đồng để tải về.');

    db.prepare('UPDATE courses SET clone_count = clone_count + 1 WHERE id = ?').run(source.id);

    const chapters = safeJsonParse(source.chapters_json, []) || [];
    const metadata = {
      ...(safeJsonParse(source.metadata_json, {}) || {}),
      clonedFrom: source.id,
      clonedFromAuthor: source.author_name,
    };
    const now = new Date().toISOString();
    const newId = `course-${randomUUID()}`;
    const clonedCourse = {
      id: newId,
      name: source.name,
      description: source.description || '',
      type: 'imported',
      status: 'ready',
      rawDocumentId: null,
      metadata,
      chapters,
      tags: safeJsonParse(source.tags_json, []) || [],
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    };

    // Nếu đã đăng nhập, lưu trực tiếp bản sao vào tài khoản cloud trên SQLite
    if (ctx.auth?.user) {
      db.prepare(`
        INSERT INTO courses (
          id, owner_id, name, description, type, status, raw_document_id,
          metadata_json, chapters_json, is_public, share_code, tags_json, clone_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'imported', 'ready', NULL, ?, ?, 0, NULL, ?, 0, ?, ?)
      `).run(
        newId,
        ctx.auth.user.id,
        clonedCourse.name,
        clonedCourse.description,
        JSON.stringify(metadata),
        JSON.stringify(chapters),
        JSON.stringify(clonedCourse.tags),
        now,
        now,
      );
      db.prepare(`
        INSERT INTO study_events (id, user_id, course_id, event_type, xp_earned, meta_json, created_at)
        VALUES (?, ?, ?, 'course_clone', 0, ?, ?)
      `).run(`evt-${randomUUID()}`, ctx.auth.user.id, newId, JSON.stringify({ sourceId: source.id }), now);
    }

    sendJson(res, 201, {
      ok: true,
      course: clonedCourse,
      savedToCloud: Boolean(ctx.auth?.user),
      cloneCount: Number(source.clone_count || 0) + 1,
    });
  });
}
