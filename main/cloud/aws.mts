// THE TWO THINGS A CLOUD RUN NEEDS FROM AWS, AND NOTHING ELSE.
//
// main/cloud/run.mts is written against two small interfaces so a test can
// run it against the real sandbox server on this machine (see
// tests/a-cloud-run-brings-the-agents-work-home.test.mts). These are the real
// ones: the AgentCore session (invoke, stop) and the S3 bucket (put, get, and
// the presigned links the sandbox uses, so it holds no AWS rights of its own).
//
// They sign as the `agentbox-cloud` profile that scripts/cloud-setup.mjs made:
// an IAM user that may only start and stop sessions on one runtime and read
// and write one bucket's `runs/`. Never the 12-hour admin sign-in.
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand, StopRuntimeSessionCommand } from '@aws-sdk/client-bedrock-agentcore';
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCopyCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  type GetObjectCommandOutput, type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CloudPayload, CloudReply, CloudTransport } from './managed.mts';

interface AwsOptions {
  region?: string;
  profile?: string;
  /** For tests, which stand in for AWS. */
  endpoint?: string;
  credentials?: S3ClientConfig['credentials'];
  timeoutMs?: number;
}

/** What the SDK's errors carry that is read here. */
interface AwsError {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

// A link the sandbox uses must outlive the longest run (8 hours) plus the
// upload at its end, with room to spare.
const LINK_SECONDS = 12 * 60 * 60;

// A request that hangs is retried by the caller; one that never returns would
// freeze the run. The SDK only warns at its request timeout unless told to
// throw. Minutes, not seconds: sending a run's code up and a cold start both
// take longer than a minute, and a minute's limit killed every such run.
const TIMEOUT_MS = 5 * 60_000;
const COPY_PIECE_BYTES = 32 * 1024 * 1024;

// The byte ranges `extend` copies a `size`-byte base in: each at least `piece`
// long, so never under S3's 5 MiB, and together exactly the base.
export function copyRanges(size: number, piece: number = COPY_PIECE_BYTES): string[] {
  const pieces = Math.max(1, Math.floor(size / piece));
  const each = Math.ceil(size / pieces);
  return Array.from({ length: pieces }, (_, i) => `bytes=${i * each}-${Math.min(size, (i + 1) * each) - 1}`);
}

const http = (timeoutMs: number = TIMEOUT_MS) => ({ requestTimeout: timeoutMs, connectionTimeout: Math.min(10_000, timeoutMs), throwOnRequestTimeout: true });
// `endpoint` and `credentials` are for tests, which stand in for AWS.
const where = ({ endpoint, credentials }: Pick<AwsOptions, 'endpoint' | 'credentials'>) => ({ ...(endpoint ? { endpoint } : {}), ...(credentials ? { credentials } : {}) });

export function awsTransport({ region, runtimeArn, profile, endpoint, credentials, timeoutMs }: AwsOptions & { runtimeArn?: string }): CloudTransport {
  const client = new BedrockAgentCoreClient({ region, profile, requestHandler: http(timeoutMs), ...where({ endpoint, credentials }) });
  return {
    async invoke(sessionId: string, payload: CloudPayload): Promise<CloudReply> {
      const out = await client.send(new InvokeAgentRuntimeCommand({
        agentRuntimeArn: runtimeArn,
        runtimeSessionId: sessionId,
        payload: Buffer.from(JSON.stringify(payload)),
        contentType: 'application/json',
        accept: 'application/json',
      }));
      // The SDK types every output field optional; a call that succeeded has its body.
      const text = await out.response!.transformToString();
      return JSON.parse(text);
    },
    async stop(sessionId: string): Promise<void> {
      await client.send(new StopRuntimeSessionCommand({ agentRuntimeArn: runtimeArn, runtimeSessionId: sessionId }));
    },
  };
}

export function awsStorage({ region, bucket, profile, endpoint, credentials, timeoutMs }: AwsOptions & { bucket?: string }) {
  // WHEN_REQUIRED: by default the SDK now signs a checksum of the body into
  // every upload link, which a link made before the body exists cannot match,
  // so every upload from the sandbox would be refused.
  const s3 = new S3Client({ region, profile, requestHandler: http(timeoutMs), requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', ...where({ endpoint, credentials }), ...(endpoint ? { forcePathStyle: true } : {}) });
  return {
    async put(key: string, body: string | Buffer): Promise<void> {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    },
    async get(key: string): Promise<Buffer | null> {
      try {
        const o = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return Buffer.from(await o.Body!.transformToByteArray());
      } catch (err) {
        if ((err as AwsError | null)?.name === 'NoSuchKey' || (err as AwsError | null)?.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    // Straight to a file, a piece at a time; false when it is not there.
    async getToFile(key: string, file: string): Promise<boolean> {
      let o: GetObjectCommandOutput;
      try { o = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); } catch (err) {
        if ((err as AwsError | null)?.name === 'NoSuchKey' || (err as AwsError | null)?.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
      // In Node the SDK's body is a Readable.
      await pipeline(o.Body as Readable, fs.createWriteStream(file));
      return true;
    },
    async putFile(key: string, file: string): Promise<void> {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.createReadStream(file), ContentLength: fs.statSync(file).size }));
    },
    // `key` made in the bucket as `base` (which is `start` bytes long)
    // followed by `file` from byte `start`, so only that tail leaves this Mac.
    // The base is copied in pieces at once: as one piece, 400 MiB took 11 s.
    // An upload that fails part-way is cleared by the bucket's lifecycle rule
    // (scripts/cloud-setup.mjs), as this login may not abort one.
    async extend(key: string, base: string, file: string, start: number): Promise<void> {
      const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }));
      const copied = await Promise.all(copyRanges(start).map((range, i) => s3.send(new UploadPartCopyCommand({
        Bucket: bucket, Key: key, UploadId, PartNumber: i + 1, CopySource: `${bucket}/${base}`, CopySourceRange: range,
      })).then((r) => ({ PartNumber: i + 1, ETag: r.CopyPartResult?.ETag }))));
      const last = copied.length + 1;
      const length = fs.statSync(file).size - start;
      const tail = await s3.send(new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber: last, Body: fs.createReadStream(file, { start }), ContentLength: length }));
      await s3.send(new CompleteMultipartUploadCommand({
        Bucket: bucket, Key: key, UploadId,
        MultipartUpload: { Parts: [...copied, { PartNumber: last, ETag: tail.ETag }] },
      }));
    },
    // Whether an object is there, without reading it.
    async exists(key: string): Promise<boolean> {
      try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; } catch (err) {
        if ((err as AwsError | null)?.name === 'NotFound' || (err as AwsError | null)?.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    },
    async del(key: string): Promise<void> {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    getUrl: (key: string, seconds: number = LINK_SECONDS) => getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: seconds }),
    putUrl: (key: string, seconds: number = LINK_SECONDS) => getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: seconds }),
    headUrl: (key: string, seconds: number = LINK_SECONDS) => getSignedUrl(s3, new HeadObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: seconds }),
  };
}
