const { app, BrowserWindow, dialog } = require("electron");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const API_PORT = 4000;
const PG_PORT = 55432;

let mainWindow = null;
let apiProcess = null;
let postgresStartedByUs = false;
let quitting = false;

const singleInstance = app.requestSingleInstanceLock();

if (!singleInstance) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function appRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bedss");
  }

  return path.resolve(__dirname, "..");
}

function runtimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bedss", "runtime");
  }

  return path.join(path.resolve(__dirname, ".."), "electron-runtime", "runtime");
}

function userRoot() {
  return path.join(app.getPath("userData"), "server");
}

function log(message) {
  const dir = userRoot();
  fs.mkdirSync(dir, { recursive: true });

  fs.appendFileSync(
    path.join(dir, "electron.log"),
    `[${new Date().toISOString()}] ${message}\n`,
    "utf8"
  );
}

function run(command, args, options = {}) {
  log(`RUN ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    ...options
  });

  if (result.stdout) log(result.stdout);
  if (result.stderr) log(result.stderr);

  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed (${result.status}).\n${result.stderr || result.stdout || ""}`
    );
  }

  return result;
}

function apiHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: API_PORT,
        path: "/api/health",
        timeout: timeoutMs
      },
      (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          resolve(
            res.statusCode === 200 &&
            body.includes('"status":"ok"')
          );
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.on("error", () => resolve(false));
  });
}

async function waitForApi(seconds = 45) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await apiHealth()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }

  return false;
}

function buildEnvironment() {
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(API_PORT),
    HOST: "0.0.0.0",
    APP_ORIGIN: `http://127.0.0.1:${API_PORT}`,
    DATABASE_URL:
      `postgresql://bedss:bedss_local@127.0.0.1:${PG_PORT}/bedss`
  };
}

function initializePostgres(pgBin, dataDir) {
  if (fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    return;
  }

  log("Initializing PostgreSQL");

  fs.mkdirSync(dataDir, { recursive: true });

  run(
    path.join(pgBin, "initdb.exe"),
    [
      "-D",
      dataDir,
      "-U",
      "bedss",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C"
    ]
  );

  const config = path.join(dataDir, "postgresql.conf");

  fs.appendFileSync(
    config,
    [
      "",
      "# BEDSS Electron",
      `port = ${PG_PORT}`,
      "listen_addresses = '127.0.0.1'",
      ""
    ].join("\n"),
    "utf8"
  );
}

function postgresRunning(pgCtl, dataDir) {
  const status = spawnSync(
    pgCtl,
    ["-D", dataDir, "status"],
    {
      windowsHide: true,
      encoding: "utf8"
    }
  );

  return status.status === 0;
}

function startPostgres(pgBin, dataDir, logFile) {
  const pgCtl = path.join(pgBin, "pg_ctl.exe");

  if (postgresRunning(pgCtl, dataDir)) {
    log("PostgreSQL already running");
    return;
  }

  run(
    pgCtl,
    [
      "-D",
      dataDir,
      "-l",
      logFile,
      "-w",
      "start"
    ]
  );

  postgresStartedByUs = true;
  log("PostgreSQL started");
}

function prepareDatabase(pgBin, env) {
  const psql = path.join(pgBin, "psql.exe");
  const createdb = path.join(pgBin, "createdb.exe");

  const exists = spawnSync(
    psql,
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(PG_PORT),
      "-U",
      "bedss",
      "-d",
      "postgres",
      "-tAc",
      "SELECT 1 FROM pg_database WHERE datname='bedss'"
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      env
    }
  );

  if (
    exists.status !== 0 ||
    !String(exists.stdout || "").trim().includes("1")
  ) {
    run(
      createdb,
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(PG_PORT),
        "-U",
        "bedss",
        "bedss"
      ],
      { env }
    );

    log("BEDSS database created");
  }

  run(
    psql,
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(PG_PORT),
      "-U",
      "bedss",
      "-d",
      "postgres",
      "-c",
      "ALTER USER bedss WITH PASSWORD 'bedss_local';"
    ],
    { env }
  );
}

function runMigrationsAndSeed(root, nodeExe, env) {
  const cli = path.join(root, "api", "dist", "cli.js");
  const seed = path.join(root, "api", "dist", "seed.js");

  run(
    nodeExe,
    [cli, "migrate"],
    {
      cwd: root,
      env
    }
  );

  const marker = path.join(userRoot(), ".seeded");

  if (!fs.existsSync(marker)) {
    run(
      nodeExe,
      [seed],
      {
        cwd: root,
        env
      }
    );

    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    log("Seed completed");
  }
}

async function startApi(root, nodeExe, env) {
  if (await apiHealth()) {
    throw new Error(
      `Port ${API_PORT} is already serving BEDSS. Close the old BEDSS-Kur.cmd window and start BEDSS again.`
    );
  }

  const server = path.join(root, "api", "dist", "server.js");
  const apiLog = path.join(userRoot(), "api.log");

  const out = fs.openSync(apiLog, "a");

  apiProcess = spawn(
    nodeExe,
    [server],
    {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ["ignore", out, out]
    }
  );

  apiProcess.on("exit", (code) => {
    log(`API exited with code ${code}`);
  });

  if (!(await waitForApi())) {
    throw new Error(
      `BEDSS API could not start. Log: ${apiLog}`
    );
  }

  log("BEDSS API ready");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    title: "BEDSS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${API_PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function stopServices() {
  if (quitting) return;
  quitting = true;

  try {
    if (apiProcess && !apiProcess.killed) {
      apiProcess.kill();
    }
  } catch (error) {
    log(`API stop error: ${error.message}`);
  }

  try {
    if (postgresStartedByUs) {
      const root = runtimeRoot();
      const pgCtl = path.join(
        root,
        "postgresql",
        "bin",
        "pg_ctl.exe"
      );

      const dataDir = path.join(userRoot(), "postgres");

      spawnSync(
        pgCtl,
        ["-D", dataDir, "-m", "fast", "-w", "stop"],
        {
          windowsHide: true,
          encoding: "utf8"
        }
      );
    }
  } catch (error) {
    log(`PostgreSQL stop error: ${error.message}`);
  }
}

app.whenReady().then(async () => {
  try {
    const root = appRoot();
    const runtime = runtimeRoot();

    fs.mkdirSync(userRoot(), { recursive: true });

    const nodeExe = path.join(runtime, "node", "node.exe");
    const pgBin = path.join(runtime, "postgresql", "bin");

    const dataDir = path.join(userRoot(), "postgres");
    const pgLog = path.join(userRoot(), "postgres.log");

    const env = buildEnvironment();

    log(`BEDSS root: ${root}`);
    log(`User root: ${userRoot()}`);

    initializePostgres(pgBin, dataDir);
    startPostgres(pgBin, dataDir, pgLog);
    prepareDatabase(pgBin, env);
    runMigrationsAndSeed(root, nodeExe, env);
    await startApi(root, nodeExe, env);

    createWindow();
  } catch (error) {
    log(error.stack || error.message);

    dialog.showErrorBox(
      "BEDSS baslatilamadi",
      `${error.message}\n\nLog:\n${path.join(userRoot(), "electron.log")}`
    );

    await stopServices();
    app.quit();
  }
});

app.on("before-quit", () => {
  stopServices();
});

app.on("window-all-closed", () => {
  app.quit();
});
