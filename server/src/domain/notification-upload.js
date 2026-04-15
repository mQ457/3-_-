const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const uploadDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExts = new Set([
  "stl",
  "obj",
  "amf",
  "3mf",
  "fbx",
  "pdf",
  "doc",
  "docx",
  "txt",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

function fileExt(name) {
  return String(path.extname(name || "")).toLowerCase().replace(".", "");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = fileExt(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext ? `.${ext}` : ""}`);
  },
});

const notificationUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = fileExt(file.originalname);
    if (!ext || !allowedExts.has(ext)) {
      cb(
        new Error(
          "Разрешены файлы: STL, OBJ, AMF, 3MF, FBX, PDF, DOC, DOCX, TXT, JPG, PNG, WEBP."
        )
      );
      return;
    }
    cb(null, true);
  },
});

module.exports = { notificationUpload };
