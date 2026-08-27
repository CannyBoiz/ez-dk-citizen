import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono() //  initialize Hono framework
const db = drizzle(process.env.DATABASE_URL!)



app.get('/', (c) => {
  return c.text('Hello Hono!')
})


serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
