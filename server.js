require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'balaji_secret_2024';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@balaji.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'balaji@123';

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── DATABASE ──────────────────────────────────────────────────────────────────
// Local dev: uses file:./balaji.db  |  Production: uses TURSO_DB_URL
const db = createClient({
  url: process.env.TURSO_DB_URL || 'file:./balaji.db',
  authToken: process.env.TURSO_DB_AUTH_TOKEN,
});

async function qGet(sql, args = []) {
  const { rows } = await db.execute({ sql, args });
  return rows[0] ?? null;
}
async function qAll(sql, args = []) {
  const { rows } = await db.execute({ sql, args });
  return rows;
}
async function qRun(sql, args = []) {
  return db.execute({ sql, args });
}

// ── DB INIT ───────────────────────────────────────────────────────────────────
async function initDB() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      unit TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 100,
      description TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      gst_number TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'Pending',
      payment_status TEXT DEFAULT 'Unpaid',
      delivery_address TEXT,
      notes TEXT,
      order_date TEXT DEFAULT (datetime('now','localtime')),
      delivery_date TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      payment_date TEXT DEFAULT (datetime('now','localtime')),
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )`,
  ], 'write');

  // Seed admin
  const existingAdmin = await qGet('SELECT id FROM admin WHERE email = ?', [ADMIN_EMAIL]);
  if (!existingAdmin) {
    const hashed = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    await qRun('INSERT INTO admin (email, password) VALUES (?, ?)', [ADMIN_EMAIL, hashed]);
    console.log('✅ Admin created:', ADMIN_EMAIL);
  }

  // Seed sample data
  const row = await qGet('SELECT COUNT(*) as c FROM products');
  if (Number(row.c) === 0) {
    const products = [
      ['Standard Fly Ash Brick (9×4×3)', 'Fly Ash Bricks', 5.5, 'brick', 50000, 5000, '9x4x3 inch standard size, IS 12894 compliant'],
      ['Fly Ash Brick (9×4×2)', 'Fly Ash Bricks', 4.8, 'brick', 30000, 3000, '9x4x2 inch, lightweight construction'],
      ['Hollow Fly Ash Block (16×8×8)', 'Fly Ash Bricks', 38, 'block', 8000, 500, '16x8x8 inch hollow block'],
      ['RMC M20 Grade', 'Ready Mix Concrete', 4800, 'cum', 500, 50, 'M20 grade ready mix concrete, 28 day strength'],
      ['RMC M25 Grade', 'Ready Mix Concrete', 5200, 'cum', 400, 50, 'M25 grade, suitable for slabs and beams'],
      ['RMC M30 Grade', 'Ready Mix Concrete', 5800, 'cum', 300, 30, 'M30 high strength concrete'],
      ['RMC M35 Grade', 'Ready Mix Concrete', 6400, 'cum', 200, 20, 'M35 premium grade for structural elements'],
      ['Fly Ash (Bulk)', 'Raw Materials', 1200, 'tonne', 200, 20, 'Class C fly ash for construction use'],
    ];
    for (const p of products) {
      await qRun('INSERT INTO products (name, category, price, unit, stock, min_stock, description) VALUES (?, ?, ?, ?, ?, ?, ?)', p);
    }

    const customers = [
      ['Ravi Constructions', '9876543210', 'ravi@example.com', 'Gachibowli, Hyderabad', 3, 48500],
      ['Sri Sai Builders', '9876543211', 'saisai@example.com', 'Kondapur, Hyderabad', 5, 125000],
      ['Lakshmi Infra', '9876543212', '', 'Kukatpally, Hyderabad', 2, 22000],
      ['Venkat & Sons', '9876543213', 'venkat@example.com', 'Ameerpet, Hyderabad', 1, 9600],
    ];
    for (const c of customers) {
      await qRun('INSERT INTO customers (name, phone, email, address, total_orders, total_spent) VALUES (?, ?, ?, ?, ?, ?)', c);
    }

    const sampleOrders = [
      ['BRB-0001', 1, 'Ravi Constructions', '9876543210', 1, 'Standard Fly Ash Brick (9×4×3)', 5000, 5.5, 27500, 'Delivered', 'Paid', 'Gachibowli, Hyderabad', '2024-01-10 09:00:00'],
      ['BRB-0002', 2, 'Sri Sai Builders', '9876543211', 4, 'RMC M20 Grade', 20, 4800, 96000, 'Delivered', 'Paid', 'Kondapur, Hyderabad', '2024-01-12 10:30:00'],
      ['BRB-0003', 3, 'Lakshmi Infra', '9876543212', 2, 'Fly Ash Brick (9×4×2)', 4000, 4.8, 19200, 'Pending', 'Unpaid', 'Kukatpally, Hyderabad', '2024-01-14 11:00:00'],
      ['BRB-0004', 4, 'Venkat & Sons', '9876543213', 1, 'Standard Fly Ash Brick (9×4×3)', 2000, 5.5, 11000, 'Pending', 'Unpaid', 'Ameerpet, Hyderabad', '2024-01-15 14:00:00'],
      ['BRB-0005', 2, 'Sri Sai Builders', '9876543211', 5, 'RMC M25 Grade', 15, 5200, 78000, 'Delivered', 'Unpaid', 'Kondapur, Hyderabad', '2024-01-16 09:00:00'],
    ];
    for (const o of sampleOrders) {
      await qRun('INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, product_id, product_name, quantity, unit_price, total_amount, status, payment_status, delivery_address, order_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', o);
    }
    console.log('✅ Sample data seeded');
  }
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── HELPER ────────────────────────────────────────────────────────────────────
async function genOrderNum() {
  const row = await qGet("SELECT MAX(CAST(SUBSTR(order_number,5) AS INTEGER)) as n FROM orders WHERE order_number LIKE 'BRB-%'");
  return 'BRB-' + String((Number(row?.n) || 0) + 1).padStart(4, '0');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await qGet('SELECT * FROM admin WHERE email = ?', [email]);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, email: admin.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await qGet('SELECT * FROM admin WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, admin.password)) {
      return res.status(400).json({ error: 'Current password is wrong' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    await qRun('UPDATE admin SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, async (_req, res) => {
  try {
    const [
      { c: totalOrders },
      { t: totalRevenue },
      { c: pendingOrders },
      { t: unpaidAmount },
      { c: totalCustomers },
      { c: lowStock },
    ] = await Promise.all([
      qGet('SELECT COUNT(*) as c FROM orders'),
      qGet("SELECT COALESCE(SUM(total_amount),0) as t FROM orders WHERE payment_status='Paid'"),
      qGet("SELECT COUNT(*) as c FROM orders WHERE status='Pending'"),
      qGet("SELECT COALESCE(SUM(total_amount),0) as t FROM orders WHERE payment_status='Unpaid'"),
      qGet('SELECT COUNT(*) as c FROM customers'),
      qGet('SELECT COUNT(*) as c FROM products WHERE stock <= min_stock AND active=1'),
    ]);

    const [recentOrders, monthlyRevenue, topProducts] = await Promise.all([
      qAll('SELECT * FROM orders ORDER BY order_date DESC LIMIT 5'),
      qAll(`SELECT strftime('%Y-%m', order_date) as month, SUM(total_amount) as revenue, COUNT(*) as count FROM orders WHERE payment_status='Paid' GROUP BY month ORDER BY month DESC LIMIT 6`),
      qAll('SELECT product_name, SUM(quantity) as total_qty, SUM(total_amount) as total_rev, COUNT(*) as order_count FROM orders GROUP BY product_name ORDER BY total_rev DESC LIMIT 5'),
    ]);

    res.json({ totalOrders, totalRevenue, pendingOrders, unpaidAmount, totalCustomers, lowStock, recentOrders, monthlyRevenue, topProducts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
app.get('/api/products', auth, async (_req, res) => {
  try {
    res.json(await qAll('SELECT * FROM products WHERE active=1 ORDER BY category, name'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', auth, async (req, res) => {
  try {
    const { name, category, price, unit, stock, min_stock, description } = req.body;
    if (!name || !category || !price || !unit) return res.status(400).json({ error: 'Missing required fields' });
    const r = await qRun(
      'INSERT INTO products (name, category, price, unit, stock, min_stock, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, category, price, unit, stock || 0, min_stock || 100, description || '']
    );
    res.json({ id: Number(r.lastInsertRowid), message: 'Product added' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', auth, async (req, res) => {
  try {
    const { name, category, price, unit, stock, min_stock, description, active } = req.body;
    await qRun(
      'UPDATE products SET name=?, category=?, price=?, unit=?, stock=?, min_stock=?, description=?, active=? WHERE id=?',
      [name, category, price, unit, stock, min_stock, description, active !== undefined ? active : 1, req.params.id]
    );
    res.json({ message: 'Product updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/products/:id/stock', auth, async (req, res) => {
  try {
    const { adjustment, type } = req.body;
    const product = await qGet('SELECT stock FROM products WHERE id=?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const newStock = type === 'set' ? adjustment : product.stock + adjustment;
    if (newStock < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
    await qRun('UPDATE products SET stock=? WHERE id=?', [newStock, req.params.id]);
    res.json({ stock: newStock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    await qRun('UPDATE products SET active=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Product removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
app.get('/api/customers', auth, async (_req, res) => {
  try {
    res.json(await qAll('SELECT * FROM customers ORDER BY total_spent DESC'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/customers', auth, async (req, res) => {
  try {
    const { name, phone, email, address, gst_number } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const existing = await qGet('SELECT id FROM customers WHERE phone=?', [phone]);
    if (existing) return res.json({ id: existing.id, message: 'Customer already exists' });
    const r = await qRun(
      'INSERT INTO customers (name, phone, email, address, gst_number) VALUES (?, ?, ?, ?, ?)',
      [name, phone, email || '', address || '', gst_number || '']
    );
    res.json({ id: Number(r.lastInsertRowid), message: 'Customer added' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    const { name, phone, email, address, gst_number } = req.body;
    await qRun(
      'UPDATE customers SET name=?,phone=?,email=?,address=?,gst_number=? WHERE id=?',
      [name, phone, email, address, gst_number, req.params.id]
    );
    res.json({ message: 'Customer updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customers/:id/orders', auth, async (req, res) => {
  try {
    res.json(await qAll('SELECT * FROM orders WHERE customer_id=? ORDER BY order_date DESC', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
app.get('/api/orders', auth, async (req, res) => {
  try {
    const { status, payment, search, limit } = req.query;
    let q = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (status) { q += ' AND status=?'; params.push(status); }
    if (payment) { q += ' AND payment_status=?'; params.push(payment); }
    if (search) { q += ' AND (customer_name LIKE ? OR order_number LIKE ? OR product_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    q += ' ORDER BY order_date DESC';
    if (limit) { q += ' LIMIT ?'; params.push(parseInt(limit)); }
    res.json(await qAll(q, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', auth, async (req, res) => {
  try {
    const { customer_name, customer_phone, product_id, quantity, delivery_address, notes } = req.body;
    if (!customer_name || !customer_phone || !product_id || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const product = await qGet('SELECT * FROM products WHERE id=? AND active=1', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock} ${product.unit}` });

    const total_amount = product.price * quantity;
    const order_number = await genOrderNum();

    let customer = await qGet('SELECT id FROM customers WHERE phone=?', [customer_phone]);
    if (!customer) {
      const r = await qRun('INSERT INTO customers (name, phone) VALUES (?, ?)', [customer_name, customer_phone]);
      customer = { id: Number(r.lastInsertRowid) };
    }

    const results = await db.batch([
      {
        sql: 'INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, product_id, product_name, quantity, unit_price, total_amount, delivery_address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [order_number, customer.id, customer_name, customer_phone, product_id, product.name, quantity, product.price, total_amount, delivery_address || '', notes || ''],
      },
      { sql: 'UPDATE products SET stock = stock - ? WHERE id=?', args: [quantity, product_id] },
      { sql: 'UPDATE customers SET total_orders = total_orders + 1 WHERE id=?', args: [customer.id] },
    ], 'write');

    res.json({ id: Number(results[0].lastInsertRowid), order_number, total_amount, message: 'Order created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await qGet('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatus = ['Pending', 'Processing', 'Delivered', 'Cancelled'];
    if (!validStatus.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await qRun('UPDATE orders SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ message: 'Status updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/payment', auth, async (req, res) => {
  try {
    const { payment_status, payment_method, notes } = req.body;
    const order = await qGet('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await qRun('UPDATE orders SET payment_status=? WHERE id=?', [payment_status, req.params.id]);

    if (payment_status === 'Paid' && order.payment_status !== 'Paid') {
      await db.batch([
        { sql: 'INSERT INTO payments (order_id, amount, payment_method, notes) VALUES (?, ?, ?, ?)', args: [req.params.id, order.total_amount, payment_method || 'Cash', notes || ''] },
        { sql: 'UPDATE customers SET total_spent = total_spent + ? WHERE id=?', args: [order.total_amount, order.customer_id] },
      ], 'write');
    }

    res.json({ message: 'Payment updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await qGet('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const stmts = [];
    if (order.status !== 'Cancelled') {
      stmts.push({ sql: 'UPDATE products SET stock = stock + ? WHERE id=?', args: [order.quantity, order.product_id] });
    }
    stmts.push({ sql: 'UPDATE customers SET total_orders = MAX(0, total_orders - 1) WHERE id=?', args: [order.customer_id] });
    if (order.payment_status === 'Paid') {
      stmts.push({ sql: 'UPDATE customers SET total_spent = MAX(0, total_spent - ?) WHERE id=?', args: [order.total_amount, order.customer_id] });
    }
    stmts.push({ sql: 'DELETE FROM orders WHERE id=?', args: [order.id] });
    await db.batch(stmts, 'write');

    res.json({ message: 'Order deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
app.get('/api/payments', auth, async (_req, res) => {
  try {
    res.json(await qAll(`
      SELECT p.*, o.order_number, o.customer_name
      FROM payments p JOIN orders o ON p.order_id = o.id
      ORDER BY p.payment_date DESC LIMIT 50
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INVENTORY ─────────────────────────────────────────────────────────────────
app.get('/api/inventory', auth, async (_req, res) => {
  try {
    res.json(await qAll(`
      SELECT *, CASE WHEN stock <= min_stock THEN 1 ELSE 0 END as low_stock
      FROM products WHERE active=1 ORDER BY low_stock DESC, category, name
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── STATIC FILES ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── START ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Balaji Readymix API running on http://localhost:${PORT}`);
      console.log(`📧 Admin: ${ADMIN_EMAIL}`);
      console.log(`🔑 Password: ${ADMIN_PASSWORD}\n`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
