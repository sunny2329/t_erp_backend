const axios = require('axios');
const multer = require('multer');
const { AppError } = require('../utils/AppError');

// Files live in Supabase Storage, not local disk — Render's free-tier
// filesystem is wiped on every redeploy/spin-down, which silently orphaned
// every doc_url previously saved under local `uploads/`. Storage is in the
// same Supabase project as the DB, so it survives independently of Render.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB, matches the reference project's cap
});

function buildStorageKey(loadId, filename) {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const clean = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  return `loads/${loadId}/${yyyymm}/${Date.now()}-${clean}`;
}

async function uploadToSupabase(key, buffer, mimetype) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError('Document storage is not configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing)', 500);
  }
  await axios.post(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`,
    buffer,
    {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': mimetype || 'application/octet-stream'
      }
    }
  );
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

async function deleteFromSupabase(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = String(url || '').indexOf(marker);
  if (idx === -1) return; // not a Supabase Storage URL owned by this API
  const key = url.slice(idx + marker.length);
  await axios.delete(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY
    }
  });
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return next(new AppError(err.message, 400));
    }
    if (err) return next(err);
    if (!req.file) return next(new AppError('No file uploaded', 400));
    try {
      const key = buildStorageKey(req.params.loadId, req.file.originalname);
      req.uploadedUrl = await uploadToSupabase(key, req.file.buffer, req.file.mimetype);
      return next();
    } catch (uploadErr) {
      return next(uploadErr);
    }
  });
}

async function saveGeneratedFile(loadId, filename, buffer, mimetype) {
  const key = buildStorageKey(loadId, filename);
  return uploadToSupabase(key, buffer, mimetype || 'application/pdf');
}

module.exports = { handleUpload, saveGeneratedFile, deleteFromSupabase };
