const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../utils/AppError');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // date-partitioned, per-load folder — mirrors the reference project's
    // date-keyed S3 layout, just on local disk instead of a bucket.
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dir = path.join(UPLOAD_ROOT, 'loads', String(req.params.loadId), yyyymm);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const clean = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${clean}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB, matches the reference project's cap
});

function buildFileUrl(req, filePath) {
  const relative = path.relative(UPLOAD_ROOT, filePath).split(path.sep).join('/');
  return `${req.protocol}://${req.get('host')}/uploads/${relative}`;
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(new AppError(err.message, 400));
    }
    if (err) return next(err);
    if (!req.file) return next(new AppError('No file uploaded', 400));
    req.uploadedUrl = buildFileUrl(req, req.file.path);
    return next();
  });
}

// Same date-partitioned-per-load layout as the multer disk storage above,
// but for buffers generated in-process (PDFs) rather than a multipart
// upload — used by pdf.service.js.
function saveGeneratedFile(req, loadId, filename, buffer) {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(UPLOAD_ROOT, 'loads', String(loadId), yyyymm);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return buildFileUrl(req, filePath);
}

module.exports = { handleUpload, saveGeneratedFile, buildFileUrl, UPLOAD_ROOT };
