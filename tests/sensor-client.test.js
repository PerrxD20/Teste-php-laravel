import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { SensorClient } from "../server/sensor-client.js";
import { fileURLToPath } from "node:url";
const executable = () => fileURLToPath(import.meta.url);
function fixture(callback) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, encoding, done) {
      callback(JSON.parse(chunk), child);
      done();
    },
  });
  child.kill = () => {
    child.killed = true;
    child.emit("exit", 0);
  };
  return child;
}
test("collector client shares concurrent sampling, preserves native diagnostics and closes process", async () => {
  let starts = 0;
  let child;
  const client = new SensorClient({
    platform: "win32",
    executable,
    spawnProcess: () => {
      starts++;
      return (child = fixture((req, c) => {
        setTimeout(
          () =>
            c.stdout.write(
              JSON.stringify({
                id: req.id,
                protocolVersion: 1,
                state: "partial",
                sensors: [{ name: "CPU", type: "Temperature", value: 45 }],
                diagnostics: ["Driver não disponível"],
                capabilities: { elevated: false },
              }) + "\n",
            ),
          5,
        );
      }));
    },
  });
  const [a, b] = await Promise.all([client.sample(), client.sample()]);
  assert.equal(starts, 1);
  assert.deepEqual(a, b);
  assert.equal(a.sensors[0].value, 45);
  assert.equal(a.capabilities.elevated, false);
  client.stop();
  assert.equal(child.killed, true);
});
test("invalid protocol does not fabricate temperatures", async () => {
  const client = new SensorClient({
    platform: "win32",
    executable,
    spawnProcess: () =>
      fixture((req, c) =>
        setImmediate(() =>
          c.stdout.write('{"protocolVersion":99,"sensors":[]}\n'),
        ),
      ),
  });
  const result = await client.sample();
  assert.equal(result.state, "unavailable");
  assert.deepEqual(result.sensors, []);
  client.stop();
});
test("a hung collector is terminated and reports unavailable instead of reusing old readings", async () => {
  let child;
  const client = new SensorClient({
    platform: "win32",
    executable,
    timeoutMs: 20,
    spawnProcess: () => (child = fixture(() => {})),
  });
  const result = await client.sample();
  assert.equal(result.state, "unavailable");
  assert.equal(child.killed, true);
  assert.deepEqual(result.sensors, []);
});
test("other platforms do not launch a Windows helper", async () => {
  const client = new SensorClient({
    platform: "darwin",
    spawnProcess: () => {
      throw Error("must not launch");
    },
  });
  assert.equal((await client.sample()).state, "unsupported");
});
