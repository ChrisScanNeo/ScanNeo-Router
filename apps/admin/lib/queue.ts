import { Redis } from '@upstash/redis';

// Initialize Redis client with Upstash
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Queue helper for coverage build jobs
export const buildQueue = {
  async send(msg: unknown) {
    // Simple FIFO push to queue
    await redis.lpush('build-coverage-queue', JSON.stringify(msg));
  },

  async getStatus(jobId: string) {
    const status = await redis.hget('job-status', jobId);
    return status ? JSON.parse(status as string) : null;
  },

  async updateStatus(jobId: string, status: unknown) {
    await redis.hset('job-status', { [jobId]: JSON.stringify(status) });
  },

  async list() {
    const queue = await redis.lrange('build-coverage-queue', 0, -1);
    return queue.map((item) => JSON.parse(item as string));
  },
};
