import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface MediaConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

const MAX_PHOTO_BYTES = 1_000_000;

export interface MediaService {
  presignPut: (key: string, mime: string) => Promise<string>;
  presignGet: (key: string) => Promise<string>;
  validatePhotoSize: (bytes: number) => boolean;
}

export function createMediaService(cfg: MediaConfig): MediaService {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });

  return {
    async presignPut(key, mime) {
      const cmd = new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: mime });
      return getSignedUrl(client, cmd, { expiresIn: 900 });
    },
    async presignGet(key) {
      const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: 3600 });
    },
    validatePhotoSize(bytes) {
      return bytes <= MAX_PHOTO_BYTES;
    },
  };
}
