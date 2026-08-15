import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Print the per-service PASS/FAIL lines from the connectivity check even
    // when the test passes — the evidence is the point of running it.
    disableConsoleIntercept: true,
    // Live vendor calls: run them in order rather than racing three sandboxes.
    fileParallelism: false,
  },
});
