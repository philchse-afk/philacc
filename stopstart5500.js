// stopstart5500.js
// Symétrique de stopstart3001.js : tue tout process déjà présent sur le
// PORT (5500 par défaut), puis lance node servAcc.js.
// Usage : node stopstart5500.js
//
// À utiliser à la place d'un lancement direct de servAcc.js dans
// startAcc.bat, pour être sûr qu'un ancien process resté accroché au
// port 5500 (session Node oubliée) ne serve pas une version périmée du
// serveur pendant que vous croyez avoir démarré la nouvelle.

const { execSync, spawn } = require('child_process');
const os = require('os');

const PORT = process.env.PORT || 5500;

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
  console.log('Lancement de node servAcc.js...');
  const child = spawn('node', ['servAcc.js'], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code));
}

killPort(PORT);
startServer();
