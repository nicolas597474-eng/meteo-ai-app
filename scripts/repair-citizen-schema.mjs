import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Targeted recovery only: does NOT advance Drizzle past unapplied historical migrations.
const migrations = [
 ['0050_prevision-vs-observation', 'daily_forecast_observation_comparisons'],
 ['0058_citizen_fusion_activations', 'citizen_fusion_activations'],
 ['0059_citizen_sensor_weights', 'citizen_sensor_weights'],
 ['0060_citizen_sensor_anomalies', 'citizen_sensor_anomalies'],
 ['0061_citizen_variable_qualifications', 'citizen_variable_qualifications'],
];
const apply = process.argv.includes('--apply');
const backup = process.env.METEOAI_VERIFIED_BACKUP;
if (apply && (!backup || !existsSync(backup))) throw new Error('Verified backup path required in METEOAI_VERIFIED_BACKUP');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const result = [];
try {
 if (apply) await connection.query(`CREATE TABLE IF NOT EXISTS meteoai_schema_repairs (
  migrationName varchar(128) PRIMARY KEY, sha256 varchar(64) NOT NULL,
  appliedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`);
 for (const [name, table] of migrations) {
  const source = readFileSync(new URL('../drizzle/' + name + '.sql', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  const [existing] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  if (!existing.length && apply) {
   for (const statement of source.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await connection.query(statement);
  }
  let [columns] = await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  const expected = [...source.matchAll(/^\s*`([^`]+)`\s+(?:int|float|varchar|enum|json|bigint|timestamp)/gm), ...source.matchAll(/ADD `([^`]+)` (?:bigint|json)/g)].map(m => m[1]);
  if (apply && name === '0050_prevision-vs-observation') {
   const presentBeforeRepair = new Set(columns.map(column => column.COLUMN_NAME));
   for (const statement of source.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) {
    const addition = statement.match(/^ALTER TABLE `daily_forecast_observation_comparisons` ADD `([^`]+)` (?:bigint|json);$/);
    if (!addition) throw new Error('Unexpected non-additive statement in targeted recovery');
    if (!presentBeforeRepair.has(addition[1])) await connection.query(statement);
   }
   [columns] = await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  }
  const present = new Set(columns.map(c => c.COLUMN_NAME));
  const missing = expected.filter(c => !present.has(c));
  const [indexes] = await connection.execute('SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  const indexName = table + '_reference_idx';
  if (apply && columns.length && name !== '0050_prevision-vs-observation' && !indexes.some(i => i.INDEX_NAME === indexName)) await connection.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (refLat,refLon)`);
  if (apply && missing.length) throw new Error(table + ': missing columns: ' + missing.join(','));
  if (apply) {
   const [record] = await connection.execute('SELECT sha256 FROM meteoai_schema_repairs WHERE migrationName=?', [name]);
   if (record.length && record[0].sha256 !== hash) throw new Error('Migration checksum changed: ' + name);
   await connection.execute('INSERT IGNORE INTO meteoai_schema_repairs (migrationName,sha256) VALUES (?,?)', [name, hash]);
  }
  result.push({migration:name, table, existed:!!existing.length, applied:apply, columns:columns.length, missingColumns:missing});
 }
 console.log(JSON.stringify(result, null, 2));
 console.log('Historical Drizzle journal unchanged; recovery ledger: meteoai_schema_repairs.');
} finally { await connection.end(); }
