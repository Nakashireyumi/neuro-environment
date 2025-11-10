// dist/bridge.js
const { methods } = require("./virtualfs.js");

// JSON replacer to serialize Date
function replacer(_key, value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

// JSON reviver to turn ISO strings into Date in known fields
function reviveDates(obj) {
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) obj[k] = d;
      } else if (typeof v === "object") {
        reviveDates(v);
      }
    }
  }
  return obj;
}

process.stdin.setEncoding("utf8");

let buffer = "";
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  // Messages are delimited by \n\n (double newline)
  while (true) {
    const idx = buffer.indexOf("\n\n");
    if (idx === -1) break;
    const raw = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      const err = { id: null, error: { message: "Invalid JSON", details: String(e) } };
      process.stdout.write(JSON.stringify(err) + "\n\n");
      continue;
    }

    const { id, method, params } = msg;
    if (!methods[method]) {
      process.stdout.write(JSON.stringify({ id, error: { message: `Unknown method ${method}` } }) + DELIM);
      continue;
    }
  
    try {
      const revivedParams = Array.isArray(params) ? params.map(reviveDates) : reviveDates(params);
      const result = await methods[method](...(Array.isArray(revivedParams) ? revivedParams : [revivedParams]));
      const payload = { id, result };
      process.stdout.write(JSON.stringify(payload, replacer) + "\n\n");
    } catch (e) {
      process.stdout.write(JSON.stringify({ id, error: { message: e.message ?? String(e) } }) + "\n\n");
    }
  }
});

process.on("uncaughtException", (e) => {
  process.stdout.write(JSON.stringify({ id: null, error: { message: e.message ?? String(e) } }) + "\n\n");
});
