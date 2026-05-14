interface WaitForOptions {
  readonly timeout?: number;
  readonly interval?: number;
}

export const waitFor = async <T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: WaitForOptions = {},
): Promise<T> => {
  const { timeout = 10_000, interval = 500 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
};
