// start.js
// Cherche un process qui écoute sur PORT, le tue si trouvé, puis lance node server.js
// Usage : node start.js

const { execSync, spawn } = require('child_process');
const os = require('os');

const PORT = process.env.PORT || 3001;

function killPortWindows(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = output.split('\n').filter(l => l.includes('LISTENING'));

    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }

    if (pids.size === 0) {
      console.log(`Aucun process trouvé sur le port ${port}.`);
      return;
    }

    for (const pid of pids) {
      console.log(`Kill du process PID ${pid} (port ${port})...`);
      execSync(`taskkill /PID ${pid} /F`);
    }
  } catch (err) {
    // findstr renvoie un code d'erreur si rien n'est trouvé, ce n'est pas une vraie erreur
    console.log(`Aucun process trouvé sur le port ${port}.`);
  }
}

function killPortUnix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`).toString().trim();
    if (!output) {
      console.log(`Aucun process trouvé sur le port ${port}.`);
      return;
    }

    const pids = output.split('\n').filter(Boolean);
    for (const pid of pids) {
      console.log(`Kill du process PID ${pid} (port ${port})...`);
      execSync(`kill -9 ${pid}`);
    }
  } catch (err) {
    console.log(`Aucun process trouvé sur le port ${port}.`);
  }
}

function killPort(port) {
  if (os.platform() === 'win32') {
    killPortWindows(port);
  } else {
    killPortUnix(port);
  }
}

function startServer() {
  console.log('Lancement de node server.js...');
  const child = spawn('node', ['server.js'], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code));
}

killPort(PORT);
startServer();
