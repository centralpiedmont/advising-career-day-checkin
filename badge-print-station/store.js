// store.js — flat-file record storage with atomic writes + CSV
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILES = { student: "leads.json", staff: "staff.json" };

function fileFor(kind) {
  if (!FILES[kind]) throw new Error(`unknown kind: ${kind}`);
  return path.join(DATA_DIR, FILES[kind]);
}
function load(kind) {
  try { return JSON.parse(fs.readFileSync(fileFor(kind), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function append(kind, rec) {
  const list = load(kind);
  const full = { id: crypto.randomUUID(), ts: new Date().toISOString(), ...rec };
  list.push(full);
  writeAtomic(fileFor(kind), list);
  return full;
}
function getById(kind, id) { return load(kind).find((r) => r.id === id) || null; }
function clear(kind) { writeAtomic(fileFor(kind), []); }

function csv(kind) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const list = load(kind);
  if (kind === "staff") {
    return "Timestamp,Name,Role,Organization\n" +
      list.map((r) => [q(r.ts), q(r.name), q(r.role), q(r.org)].join(",")).join("\n");
  }
  return "Timestamp,Name,Email,Programs\n" +
    list.map((r) => [q(r.ts), q(r.name), q(r.email), q((r.programs || []).join("; "))].join(",")).join("\n");
}
module.exports = { load, append, getById, clear, csv, fileFor };
