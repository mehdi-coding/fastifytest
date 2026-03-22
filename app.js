const fastify = require('fastify')({ logger: true });
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 5432,
});

// Create table on startup
async function initDB() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);
}

fastify.get('/items', async () => {
    const { rows } = await pool.query('SELECT * FROM items');
    return rows;
});

fastify.post('/items', async (request) => {
    const { name } = request.body;
    const { rows } = await pool.query(
        'INSERT INTO items(name) VALUES($1) RETURNING *',
        [name]
    );
    return rows[0];
});

fastify.delete('/items/:id', async (request) => {
    const { id } = request.params;
    await pool.query('DELETE FROM items WHERE id=$1', [id]);
    return { success: true };
});

const start = async () => {
    await initDB();
    await fastify.listen({ port: process.env.PORT, host: '0.0.0.0' });
};

start();