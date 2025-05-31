const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const port = 3000;
let currentChild = null;

// -------------------
// Middleware
// -------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// -------------------
// Base de donn�es utilisateurs
// -------------------
const db = new sqlite3.Database('./users.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
});

// -------------------
// Authentification (FR et EN)
// -------------------
app.post('/connexion', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) return res.status(500).send("Erreur de base de donn�es.");
    if (row) return res.redirect('/choix.html');
    return res.status(401).send("Nom d'utilisateur ou mot de passe incorrect.");
  });
});

app.post('/connexion_Ang', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) return res.status(500).send("Database error.");
    if (row) return res.redirect('/choix_Ang.html');
    return res.status(401).send("Incorrect username or password.");
  });
});

// -------------------
// Cr�ation de compte (FR et EN)
// -------------------
app.post('/creer-compte', (req, res) => {
  const { username, password, ['confirm-password']: confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.send("Les mots de passe ne correspondent pas.");
  }
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.send("Nom d'utilisateur d�j� utilis�.");
      return res.send("Erreur lors de la cr�ation du compte.");
    }
    res.redirect('/connexion.html?success=1');
  });
});

app.post('/creer-compte_Ang', (req, res) => {
  const { username, password, ['confirm-password']: confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.send("Passwords do not match.");
  }
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.send("Username already taken.");
      return res.send("Error creating account.");
    }
    res.redirect('/connexion_Ang.html?success=1');
  });
});


// -------------------
// Simulation NS3-LoRaWAN (SSE)
// -------------------
app.get('/execute', (req, res) => {
  const dValues = req.query.dValues || '10,20,30';
  const gValues = req.query.gValues || '2';
  const tValue = req.query.tValue || '120';
  const aValues = req.query.aValues || '3';
  const pValues = req.query.pValues || '10';
  const rValue = req.query.rValue || '3';
  const DValue = req.query.DValue || 'false';
  const TValue = req.query.TValue || 'false';
  const mecanisme = req.query.Mec || 'GeoNet';

  const ns3Path = "/home/mohamed-ali/ns-3-dev";

  let command = "";

 switch (mec) {
  case "ADR":
    command = `${ns3Path}/simulation_script_ADR.sh -d "${dValues}" -g "${gValues}" -t "${tValue}" -a "${aValues}" -p "${pValues}" -r "${rValue}" -D "${DValue}" -T "${TValue}"`;
    break;

  default:
    command = `${ns3Path}/simulation_script_GeoNet.sh -d "${dValues}" -g "${gValues}" -t "${tValue}" -a "${aValues}" -p "${pValues}" -r "${rValue}" -D "${DValue}" -T "${TValue}"`;
    break;
}
  console.log("Commande ex�cut�e (SSE):", command);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  currentChild = exec(command);

  currentChild.stdout.on('data', (data) => {
    res.write(`data: ${data}\n\n`);
  });

  currentChild.stderr.on('data', (data) => {
    res.write(`data: ERREUR: ${data}\n\n`);
  });

  currentChild.on('exit', () => {
    res.write('data: Simulation termin�e\n\n');
    res.write('data: OK\n\n');
    res.end();
    currentChild = null;
  });

  currentChild.on('error', (err) => {
    res.write(`data: ERREUR: ${err.message}\n\n`);
    res.end();
    currentChild = null;
  });
});

// -------------------
// Stopper simulation
// -------------------
const kill = require('tree-kill');

app.get('/stop', (req, res) => {
  if (currentChild) {
    kill(currentChild.pid, 'SIGTERM', (err) => {
      if (err) {
        console.error('Erreur lors de larr�t de la simulation :', err);
        return res.status(500).send('Erreur lors de larr�t de la simulation.');
      }
      console.log('Simulation arr�t�e avec succ�s.');
      currentChild = null;
      res.send('Simulation arr�t�e.');
    });
  } else {
    res.send('Aucune simulation en cours.');
  }
});


// -------------------
// Simulation avanc�e
// -------------------
app.get('/advanced-execute', (req, res) => {
  const appPeriod = parseInt(req.query.appPeriod) || 12;
  const payload = parseInt(req.query.payload) || 50;
  const nGateways = parseInt(req.query.nGateways);
  const nDevices = parseInt(req.query.nDevices) || 10;
  const radius = parseInt(req.query.radius) || 7500;
  const simulationTime = parseInt(req.query.simulationTime) || 60;
  const batiments = req.query.Batiments === 'true';
  const sftable = req.query.sftable || '';
  const manualCoordinates = req.query.manualCoordinates || '';  
  const manualPT = req.query.manualPT || '';  


  if (isNaN(nGateways) || isNaN(nDevices) || nGateways <= 0 || nDevices <= 0) {
    return res.status(400).send('Param�tres invalides.');
  }

  let gatewayPositions = req.query.gatewayPositions;
  if (!gatewayPositions) {
    const presets = {
      1: '0,0,15',
      2: '0,0,15;4000,4000,15',
      3: '0,0,15;4000,4000,15;-4000,-4000,15',
      4: '0,0,15;4000,4000,15;-4000,-4000,15;-4000,4000,15',
      5: '0,0,15;4000,4000,15;-4000,-4000,15;-4000,4000,15;4000,-4000,15'
    };
    gatewayPositions = presets[nGateways] || presets[1];
  }

  const ns3Path = "/home/mohamed-ali/ns-3-dev";

  const command = `${ns3Path}/ns3 run 'complete-network-GeoNet_Man.cc --appPeriod=${appPeriod} --payload=${payload} --nGateways=${nGateways} --nDevices=${nDevices} --Batiments=${batiments} --gatewayPositions=${gatewayPositions} --radius=${radius} --simulationTime=${simulationTime} --manualCoordinates=${manualCoordinates} --manualPT=${manualPT}'`;

  console.log("Commande ex�cut�e (avanc�e):", command);

  exec(command, (error, stdout, stderr) => {
    if (error) return res.status(500).send(`Erreur: ${error.message}`);
    if (stderr) return res.status(500).send(`Erreur stderr: ${stderr}`);
    const results = stdout.split('\n').filter(line => line.trim() !== '');
    res.json(results);
  });
});

// -------------------
// Historique
// -------------------
app.get('/api/historique', (req, res) => {
  const fichier = path.resolve("C:/Users/USER/Desktop/historique.txt");
  fs.readFile(fichier, 'utf8', (err, data) => {
    if (err) {
      console.error("Erreur lors de la lecture du fichier :", err);
      return res.status(500).send("Erreur de lecture.");
    }
    res.send(data);
  });
});

// -------------------
// Pages HTML dynamiques (FR + EN)
// -------------------
const pages = [
  'index', 'connexion', 'connexion_Ang',
  'choix', 'choix_Ang',
  'NS3-LoRaWan', 'NS3-LoRaWan_Ang',
  'solution', 'solution_Ang',
  'simulation-manager', 'simulation-manager_Ang',
  'creer-compte', 'creer-compte_Ang'
];

pages.forEach(page => {
  app.get(`/${page}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------
// Lancer le serveur
// -------------------
app.listen(port, () => {
  console.log(` Serveur lanc� sur http://localhost:${port}`);
});
