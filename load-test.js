const CHUNK_SIZE = 50;
const TOTAL_REQUESTS = 1000;
const GATEWAY_URL = 'http://localhost:5173/api/ticket';

async function sendRequest(index) {
  const userId = `loadtest_user_${Math.random().toString(36).slice(2, 10)}`;
  const start = Date.now();

  try {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, event: 'Formula 1' }),
      signal: AbortSignal.timeout(10000),
    });

    const elapsed = Date.now() - start;
    return {
      index,
      status: res.status,
      ok: res.status === 202,
      elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      index,
      status: 0,
      ok: false,
      elapsed,
      error: err.message,
    };
  }
}

async function runChunk(chunk) {
  return Promise.all(chunk.map((idx) => sendRequest(idx)));
}

async function main() {
  console.log(`\n[LOAD TEST] ${TOTAL_REQUESTS} requests to ${GATEWAY_URL}`);
  console.log(`[LOAD TEST] Chunk size: ${CHUNK_SIZE} concurrent per batch\n`);

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < TOTAL_REQUESTS; i += CHUNK_SIZE) {
    const chunk = [];
    for (let j = 0; j < CHUNK_SIZE && i + j < TOTAL_REQUESTS; j++) {
      chunk.push(i + j);
    }

    const batchResults = await runChunk(chunk);
    results.push(...batchResults);

    const completed = results.length;
    const accepted = results.filter((r) => r.ok).length;
    const failed = completed - accepted;
    console.log(`   [${completed}/${TOTAL_REQUESTS}] Accepted: ${accepted} | Failed: ${failed}`);
  }

  const totalTime = Date.now() - startTime;
  const totalAccepted = results.filter((r) => r.ok).length;
  const totalFailed = results.filter((r) => !r.ok).length;
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.elapsed, 0) / results.length);
  const minLatency = Math.min(...results.map((r) => r.elapsed));
  const maxLatency = Math.max(...results.map((r) => r.elapsed));

  console.log('\n==============================================');
  console.log('           LOAD TEST RESULTS');
  console.log('==============================================');
  console.log(`  Total Requests:    ${TOTAL_REQUESTS}`);
  console.log(`  202 Accepted:      ${totalAccepted}`);
  console.log(`  Failed/Timed Out:  ${totalFailed}`);
  console.log(`  Total Time:        ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
  console.log(`  Throughput:        ${(TOTAL_REQUESTS / (totalTime / 1000)).toFixed(1)} req/s`);
  console.log(`  Avg Latency:       ${avgLatency}ms`);
  console.log(`  Min Latency:       ${minLatency}ms`);
  console.log(`  Max Latency:       ${maxLatency}ms`);
  console.log('==============================================\n');

  if (totalFailed > 0) {
    console.log('[WARN] Failed requests breakdown:');
    const errorMap = {};
    results.filter((r) => !r.ok).forEach((r) => {
      const key = r.status !== 0 ? `HTTP ${r.status}` : r.error || 'Unknown';
      errorMap[key] = (errorMap[key] || 0) + 1;
    });
    Object.entries(errorMap).forEach(([err, count]) => {
      console.log(`   ${err}: ${count}`);
    });
    console.log('');
  }
}

main().catch((err) => {
  console.error('[LOAD TEST] Load test crashed:', err);
  process.exit(1);
});
