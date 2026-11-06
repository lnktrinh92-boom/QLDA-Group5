import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';

/** Định dạng ảnh cho phép, nhận diện bằng "magic bytes" ở đầu file (không tin phần mở rộng / mimetype do client gửi) */
const SIGNATURES: { ext: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Nhận 1 file trường "image" trong bộ nhớ, giới hạn dung lượng theo MAX_UPLOAD_MB */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(AppError.badRequest('Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP'));
    cb(null, true);
  },
}).single('image');

/** Lưu ảnh vào thư mục uploads/<folder>/ với tên ngẫu nhiên, trả về URL công khai */
export async function saveImage(file: Express.Multer.File | undefined, folder: 'menu' | 'stalls'): Promise<string> {
  if (!file) throw AppError.badRequest('Vui lòng chọn ảnh để tải lên');
  const signature = SIGNATURES.find((s) => s.test(file.buffer));
  if (!signature) throw AppError.badRequest('File không phải ảnh hợp lệ (JPG, PNG, WEBP)');

  const dir = path.resolve(env.UPLOAD_DIR, folder);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString('hex')}.${signature.ext}`;
  await writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${folder}/${filename}`;
}
