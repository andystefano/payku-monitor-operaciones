import { Sequelize } from 'sequelize';

let sequelize;

export function getDb() {
  if (sequelize) {
    return sequelize;
  }

  const dialect = process.env.DB_DIALECT || 'mysql';
  const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
  const socketPath = connectionName ? `/cloudsql/${connectionName}` : undefined;

  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: socketPath ? undefined : process.env.DB_HOST,
    port: socketPath ? undefined : Number(process.env.DB_PORT || 3306),
    dialect,
    logging: false,
    pool: {
      max: 1,
      min: 0,
      idle: 10000,
      acquire: 30000,
    },
    dialectOptions: socketPath ? { socketPath } : {},
  });

  return sequelize;
}

export async function closeDb() {
  if (!sequelize) {
    return;
  }

  await sequelize.close();
  sequelize = null;
}
