import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.log('[Init DB] DATABASE_URL not set, skipping migrations');
    process.exit(0);
  }

  try {
    console.log('[Init DB] Starting database initialization...');
    
    // Parse DATABASE_URL (mysql://user:password@host:port/database)
    const url = new URL(databaseUrl);
    const config = {
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    };

    console.log(`[Init DB] Connecting to ${config.host}:${config.port}/${config.database}`);
    
    const connection = await mysql.createConnection(config);
    console.log('[Init DB] Connected successfully');

    // Controla quais migrações já foram aplicadas, para não reexecutar
    // arquivos antigos a cada deploy (isso já causava ALTER TABLE duplicado
    // silenciosamente tolerado só para "tabela já existe").
    await connection.execute(
      'CREATE TABLE IF NOT EXISTS `_migrations` (`name` varchar(255) NOT NULL, `appliedAt` timestamp NOT NULL DEFAULT (now()), PRIMARY KEY (`name`))'
    );
    const [appliedRows] = await connection.execute('SELECT `name` FROM `_migrations`');
    const appliedSet = new Set(appliedRows.map(row => row.name));

    // Read and execute migration files
    const migrationsDir = path.join(__dirname, 'drizzle');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[Init DB] Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      if (appliedSet.has(file)) {
        console.log(`[Init DB] ↷ ${file} já aplicada, pulando`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      // Split by statement breakpoint
      const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      
      for (const statement of statements) {
        try {
          console.log(`[Init DB] Executing: ${file} - ${statement.substring(0, 50)}...`);
          await connection.execute(statement);
          console.log(`[Init DB] ✓ Success`);
        } catch (error) {
          // Ignora erros de objeto já existente, comuns quando uma migração
          // antiga roda pela primeira vez sob este novo controle mas o
          // schema já foi criado manualmente antes.
          if (['ER_TABLE_EXISTS_ERROR', 'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME'].includes(error.code)) {
            console.log(`[Init DB] ℹ ${error.code}, ignorando (objeto já existe)`);
          } else {
            console.error(`[Init DB] ✗ Error executing statement:`, error.message);
            throw error;
          }
        }
      }

      await connection.execute('INSERT INTO `_migrations` (`name`) VALUES (?)', [file]);
      console.log(`[Init DB] ✓ ${file} registrada como aplicada`);
    }

    await connection.end();
    console.log('[Init DB] ✓ Database initialization completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Init DB] ✗ Failed to initialize database:', error);
    process.exit(1);
  }
}

initializeDatabase();
