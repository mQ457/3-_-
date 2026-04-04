const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const envFile = path.resolve(__dirname, '.env');
const env = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([^=#]+)=([^#]*)/);
  if (m) acc[m[1].trim()] = m[2].trim();
  return acc;
}, {});

const dbFile = path.resolve(__dirname, env.DATABASE_FILE || './data/app.db');
const dir = path.dirname(dbFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sql = fs.readFileSync(path.resolve(__dirname, 'sql', 'init.sql'), 'utf8');
const db = new sqlite3.Database(dbFile);

let statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
let i = 0;

function runNext() {
  if (i >= statements.length) {
    console.log('DB initialized:', dbFile);
    db.close();
    return;
  }
  const stmt = statements[i++];
  db.run(stmt, (err) => {
    if (err) {
      console.error('Error in init db:', err.message, stmt);
      db.close();
      process.exit(1);
      return;
    }
    runNext();
  });
}

runNext();
