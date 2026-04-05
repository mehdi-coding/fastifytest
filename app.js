import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'

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

const fastify = Fastify({ logger: true })

// ==========================================
// CONFIGURATION (Change these for your VPS)
// ==========================================
const DOMAIN = 'codingmehdi.com' // 👈 Change to your actual domain
const FRONTEND_URL = `https://admin.${DOMAIN}` // Use https:// if you have SSL setup
const API_PORT = process.env.PORT || 3000;

// Hardcoded test user based on your Nuxt login.vue
const TEST_USER = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'super@mindcare.com',
  password: 'password', // Hardcoded plain text for testing only!
  role: 'admin',
  name: 'Super Admin'
}

// Cookie options for cross-subdomain authentication
const cookieOptions = {
  domain: `.${DOMAIN}`, // The leading dot allows subdomains (admin & api) to share it
  path: '/',
  httpOnly: true,
  secure: false, // 👈 Set to true if you are testing via HTTPS!
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7 * 1000 // 1 week
}

// ==========================================
// PLUGINS
// ==========================================

// 1. CORS: Must strictly match the Nuxt origin and allow credentials
await fastify.register(cors, {
  origin: FRONTEND_URL, 
  credentials: true, // 👈 CRITICAL: Allows Nuxt to send/receive cookies
})

// 2. Cookie Parser
await fastify.register(cookie)

// 3. JWT: Configured to look for the token inside the cookie
await fastify.register(jwt, {
  secret: 'super-secret-test-key-replace-in-production',
  cookie: {
    cookieName: 'token',
    signed: false
  }
})

// Custom Decorator to protect routes
fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" })
  }
})

// ==========================================
// ROUTES
// ==========================================
// Routes

// Add a global OPTIONS handler for debugging (optional)
fastify.options('/*', async (request, reply) => {
    // The CORS plugin will handle this, we're just logging
    reply.status(204).send();
});


// Health check endpoint (optional)
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

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

// POST /auth/login
fastify.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body

  if (email === TEST_USER.email && password === TEST_USER.password) {
    // Sign the token with the payload you defined earlier
    const token = fastify.jwt.sign({
      id: TEST_USER.id,
      role: TEST_USER.role,
      email: TEST_USER.email,
      name: TEST_USER.name
    })

    return reply
      .setCookie('token', token, cookieOptions)
      .send({
        success: true,
        message: 'Login successful',
        data: { id: TEST_USER.id, email: TEST_USER.email, role: TEST_USER.role }
      })
  }

  return reply.code(400).send({ error: 'Invalid credentials' })
})

// GET /auth/me
fastify.get('/auth/me', { preValidation: [fastify.authenticate] }, async (request, reply) => {
  // request.user is automatically populated by jwtVerify() from the cookie
  return reply.send({
    success: true,
    data: request.user
  })
})

// POST /auth/logout
fastify.post('/auth/logout', async (request, reply) => {
  return reply
    .clearCookie('token', cookieOptions)
    .send({ success: true, message: 'Logged out' })
})

// ==========================================
// START SERVER
// ==========================================
const start = async () => {
  try {
    // Bind to 0.0.0.0 so it is accessible from outside the VPS via Nginx/Reverse Proxy
    await fastify.listen({ port: API_PORT, host: '0.0.0.0' })
    console.log(`🚀 Test API running at http://api.${DOMAIN}:${API_PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()