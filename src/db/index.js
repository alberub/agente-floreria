const { Pool, types } = require("pg");
const {
  databaseUrl,
  dbHost,
  dbUser,
  dbPassword,
  dbName,
  dbPort,
} = require("../config/env");

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
    }
  : {
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      port: dbPort,
    };

types.setTypeParser(1114, (value) => value);

const pool = new Pool(poolConfig);

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
