const fastify = require('fastify')({ logger: true });
const { Pool } = require('pg');
require('dotenv').config();
const fastifyCors = require('@fastify/cors');

const pool = new Pool({
    host: 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 5432,
});

// Create table on startup
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL
            )
        `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Register CORS with comprehensive configuration
fastify.register(fastifyCors, {
    origin: (origin, cb) => {
        // Allow your frontend domains
        const allowedOrigins = [
            'https://admin.mydomain.com',
            'https://www.admin.mydomain.com',
            // Add localhost for development if needed
            'http://localhost:3000',
            'http://localhost:3001',
        ];
        
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return cb(null, true);
        
        if (allowedOrigins.includes(origin)) {
            cb(null, true);
        } else {
            console.log('Blocked origin:', origin);
            cb(null, false); // Return false instead of error to avoid breaking
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin'
    ],
    exposedHeaders: ['Content-Length', 'X-Kuma-Revision'],
    credentials: true,
    maxAge: 86400, // 24 hours cache for preflight requests
    preflightContinue: false,
    optionsSuccessStatus: 204
});

// Add a global OPTIONS handler for debugging (optional)
fastify.options('/*', async (request, reply) => {
    console.log('OPTIONS request received for:', request.url);
    // The CORS plugin will handle this, we're just logging
    reply.status(204).send();
});

// Routes
fastify.get('/items', async (request, reply) => {
    try {
        const { rows } = await pool.query('SELECT * FROM items ORDER BY id');
        return rows;
    } catch (error) {
        console.error('Error fetching items:', error);
        reply.status(500).send({ error: 'Internal server error' });
    }
});

fastify.post('/items', async (request, reply) => {
    try {
        const { name } = request.body;
        if (!name) {
            return reply.status(400).send({ error: 'Name is required' });
        }
        
        const { rows } = await pool.query(
            'INSERT INTO items(name) VALUES($1) RETURNING *',
            [name]
        );
        return rows[0];
    } catch (error) {
        console.error('Error creating item:', error);
        reply.status(500).send({ error: 'Internal server error' });
    }
});

fastify.delete('/items/:id', async (request, reply) => {
    try {
        const { id } = request.params;
        const result = await pool.query('DELETE FROM items WHERE id=$1 RETURNING *', [id]);
        
        if (result.rowCount === 0) {
            return reply.status(404).send({ error: 'Item not found' });
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error deleting item:', error);
        reply.status(500).send({ error: 'Internal server error' });
    }
});

// Health check endpoint (optional)
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
    try {
        await initDB();
        
        // Add error handler
        fastify.setErrorHandler((error, request, reply) => {
            console.error('Error:', error);
            reply.status(500).send({ error: 'Internal server error' });
        });
        
        const port = process.env.PORT || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Server running on port ${port}`);
        console.log(`CORS enabled for admin.mydomain.com`);
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

start();