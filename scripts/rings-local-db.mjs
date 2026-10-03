import fs from 'node:fs';

// Development/test adapter only. Production requests use the real SITE_DB binding.
export class LocalDatabase {
  constructor(filename = null) {
    this.filename = filename;
    this.rows = filename && fs.existsSync(filename) ? new Map(JSON.parse(fs.readFileSync(filename, 'utf8'))) : new Map();
  }
  persist() {
    if (!this.filename) return;
    fs.writeFileSync(`${this.filename}.tmp`, JSON.stringify([...this.rows]));
    fs.renameSync(`${this.filename}.tmp`, this.filename);
  }
  prepare(sql) {
    const database = this;
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() {
        if (!sql.startsWith('SELECT state, version')) throw new Error(`Unsupported local query: ${sql}`);
        const row = database.rows.get(args[0]);
        return row ? structuredClone(row) : null;
      },
      async run() {
        let changes = 0;
        if (sql.startsWith('CREATE TABLE')) return { meta: { changes: 0 } };
        if (sql.startsWith('DELETE FROM rings_rooms')) {
          for (const [key, row] of database.rows) if (row.expires_at < args[0]) { database.rows.delete(key); changes++; }
        } else if (sql.startsWith('INSERT OR IGNORE')) {
          if (!database.rows.has(args[0])) {
            database.rows.set(args[0], { state: args[1], version: 0, expires_at: args[2] }); changes = 1;
          }
        } else if (sql.startsWith('UPDATE rings_rooms')) {
          const row = database.rows.get(args[1]);
          if (row?.version === args[2]) { row.state = args[0]; row.version++; changes = 1; }
        } else throw new Error(`Unsupported local query: ${sql}`);
        database.persist(); return { meta: { changes } };
      }
    };
  }
}
