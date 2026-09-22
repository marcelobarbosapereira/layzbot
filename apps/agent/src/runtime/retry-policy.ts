/** Errors that must stop a workflow rather than be retried by the executor. */
export type RetryPolicyError = Error & { code?: string; status?: number; transient?: boolean };

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

const neverRetryCodes = new Set([
  'CAPTCHA_REQUIRED', 'AUTHORIZATION_MISSING', 'IDENTITY_MISMATCH',
  'ACTIVITY_MISMATCH', 'AMBIGUOUS_SUBMISSION', 'UNKNOWN_REMOTE_STATE',
]);
const transientCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'NETWORK_ERROR']);

export function isTransientReadError(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const error = value as RetryPolicyError;
  if (error.code && neverRetryCodes.has(error.code)) return false;
  if (error.transient === true) return true;
  if (error.code && transientCodes.has(error.code)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || (typeof error.status === 'number' && error.status >= 500);
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Execute a read-only operation with bounded backoff. It never retries workflow decisions or submissions. */
export async function retryTransientRead<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(8, Math.floor(options.maxAttempts ?? 3)));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 5_000);
  const jitterRatio = Math.max(0, Math.min(1, options.jitterRatio ?? 0.2));
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (cause) {
      if (!isTransientReadError(cause) || attempt >= maxAttempts) throw cause;
      const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const jitter = exponential * jitterRatio * (random() * 2 - 1);
      await sleep(Math.max(0, Math.round(exponential + jitter)));
    }
  }
  throw new Error('RETRY_POLICY_UNREACHABLE');
}
