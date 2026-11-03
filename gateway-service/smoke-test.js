const { spawn } = require("child_process");
const http = require("http");
const port = process.env.PORT || 3001;

// Probe / in a loop instead of assuming a fixed startup time.
function probe() {
    return new Promise((resolve) => {
        const req = http.get({ hostname: "127.0.0.1", port, path: "/" }, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ ok: res.statusCode === 200 && body.includes("Gateway is alive"), status: res.statusCode, body }));
        });
        req.on("error", () => resolve({ ok: false, status: 0, body: "" }));
        req.setTimeout(2000, () => { req.destroy(); resolve({ ok: false, status: 0, body: "" }); });
    });
}

const server = spawn(process.execPath, ["index.js"], {
    env: { ...process.env, NODE_NO_WARNINGS: "1", PORT: String(port), KAFKA_BROKER: "127.0.0.1:9092", MONGO_URI: "mongodb://127.0.0.1:27017/ci-smoke", KAFKAJS_NO_PARTITIONER_WARNING: "1" },
    stdio: "inherit",
});

server.on("error", (err) => { console.error(err); process.exit(1); });

(async () => {
    const deadline = Date.now() + 8000;
    let result;
    do {
        await new Promise((r) => setTimeout(r, 250));
        result = await probe();
    } while (!result.ok && Date.now() < deadline);

    server.kill();

    if (!result.ok) {
        console.error(`Smoke test failed: last response status=${result.status}`);
        process.exit(1);
    }
    console.log("Smoke test passed: gateway responds on /");
    process.exit(0);
})().catch((err) => { console.error(err); server.kill(); process.exit(1); });