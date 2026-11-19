#!/usr/bin/env node
// Runs an isolated, project-local PostgreSQL cluster for development.
// It uses the PostgreSQL binaries already installed on the machine (initdb,
// pg_ctl, psql), stores data in ./.data/postgres, listens on 127.0.0.1 only,
// and never touches any other PostgreSQL server or service.
//
// Usage: node scripts/local-postgres.mjs <start|stop|status>
// Env:   PG_BIN (directory containing pg_ctl), LOCAL_PG_PORT (default 5434)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, ".data", "postgres");
const logFile = path.join(root, ".data", "postgres.log");
const port = process.env.LOCAL_PG_PORT ?? "5434";
const user = "vele";
const databases = ["vele", "vele_test"];
const isWindows = process.platform === "win32";
const exe = (name) => (isWindows ? `${name}.exe` : name);

function findBinDir() {
  if (process.env.PG_BIN && existsSync(path.join(process.env.PG_BIN, exe("pg_ctl")))) {
    return process.env.PG_BIN;
  }
  const candidates = [];
  if (isWindows) {
    const base = "C:\\Program Files\\PostgreSQL";
    if (existsSync(base)) {
      const versions = readdirSync(base)
        .filter((v) => /^\d+$/.test(v))
        .sort((a, b) => Number(b) - Number(a));
      for (const v of versions) candidates.push(path.join(base, v, "bin"));
    }
  } else {
    candidates.push("/usr/lib/postgresql/18/bin", "/usr/lib/postgresql/17/bin", "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin");
  }
  for (const dir of candidates) {
    if (existsSync(path.join(dir, exe("pg_ctl")))) return dir;
  }
  const which = spawnSync(isWindows ? "where" : "which", ["pg_ctl"], { encoding: "utf8" });
  if (which.status === 0) return path.dirname(which.stdout.split(/\r?\n/)[0]);
  return null;
}

const binDir = findBinDir();
if (!binDir) {
  console.error(
    "Could not find PostgreSQL binaries (pg_ctl). Install PostgreSQL 16+ or set PG_BIN to its bin directory.\n" +
      "Alternatively, point DATABASE_URL at any PostgreSQL database and skip this script.",
  );
  process.exit(1);
}
const bin = (name) => path.join(binDir, exe(name));

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function isRunning() {
  if (!existsSync(dataDir)) return false;
  if (run(bin("pg_ctl"), ["status", "-D", dataDir]).status !== 0) return false;
  // A stale postmaster.pid can make pg_ctl report "running" after a crash.
  return run(bin("pg_isready"), ["-h", "127.0.0.1", "-p", port]).status === 0;
}

function init() {
  if (existsSync(path.join(dataDir, "PG_VERSION"))) return;
  mkdirSync(path.dirname(dataDir), { recursive: true });
  console.log(`Initialising cluster in ${dataDir} using ${binDir}`);
  const res = run(bin("initdb"), ["-D", dataDir, "-U", user, "--auth=trust", "--encoding=UTF8", "--no-locale"], {
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
  // Listen on loopback only. Trust auth is acceptable because nothing outside
  // this machine can connect; never use this configuration in production.
  writeFileSync(path.join(dataDir, "postgresql.auto.conf"), `listen_addresses = '127.0.0.1'\nport = ${port}\nmax_connections = 60\n`, { flag: "a" });
}

function ensureDatabases() {
  for (const db of databases) {
    const exists = run(bin("psql"), ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${db}'`]);
    if (exists.stdout.trim() !== "1") {
      const res = run(bin("createdb"), ["-h", "127.0.0.1", "-p", port, "-U", user, db]);
      if (res.status !== 0) {
        console.error(res.stderr);
        process.exit(1);
      }
      console.log(`Created database ${db}`);
    }
    // btree_gist powers the booking overlap exclusion constraint.
    run(bin("psql"), ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", db, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist;"]);
  }
}

const command = process.argv[2] ?? "status";

if (command === "start") {
  init();
  if (!isRunning()) {
    // The postmaster must own a console that outlives this script: on Windows,
    // backends spawned into a console that has gone away die with 0xC0000142.
    // Launch detached (own hidden console), ignore stdio so this script never
    // waits on inherited handles, then poll pg_isready.
    if (isWindows) {
      // Start-Process gives the postmaster its own hidden console outside this
      // process group, so closing the terminal (or a Ctrl+C) cannot reach it.
      const q = (s) => `'${s.replace(/'/g, "''")}'`;
      const ps = `Start-Process -FilePath ${q(bin("pg_ctl"))} -WindowStyle Hidden -ArgumentList @('start','-D','"${dataDir}"','-l','"${logFile}"')`;
      run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", windowsHide: true });
    } else {
      const child = spawn(bin("pg_ctl"), ["start", "-D", dataDir, "-l", logFile], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    }
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (run(bin("pg_isready"), ["-h", "127.0.0.1", "-p", port]).status === 0) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) {
      console.error(`PostgreSQL failed to start within 30s. See ${logFile}`);
      process.exit(1);
    }
  }
  ensureDatabases();
  console.log(`\nPostgreSQL is running on 127.0.0.1:${port}`);
  console.log(`DATABASE_URL=postgresql://${user}@127.0.0.1:${port}/vele`);
} else if (command === "stop") {
  if (isRunning()) run(bin("pg_ctl"), ["stop", "-D", dataDir, "-m", "fast"], { stdio: "inherit" });
  else console.log("Not running.");
} else if (command === "status") {
  console.log(isRunning() ? `Running on 127.0.0.1:${port}` : "Not running.");
} else {
  console.error("Usage: node scripts/local-postgres.mjs <start|stop|status>");
  process.exit(1);
}
