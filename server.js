require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'balaji_secret_2024';

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── DATABASE SETUP ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'balaji.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS products (
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
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    gst_number TEXT,
    total_orders INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS orders (
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
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'Cash',
    payment_date TEXT DEFAULT (datetime('now','localtime')),
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

// ── SEED ADMIN ────────────────────────────────────────────────────────────────
const adminEmail = process.env.ADMIN_EMAIL || 'admin@balaji.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'balaji@123';
const existingAdmin = db.prepare('SELECT id FROM admin WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const hashed = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO admin (email, password) VALUES (?, ?)').run(adminEmail, hashed);
  console.log('✅ Admin created:', adminEmail);
}

// ── SEED SAMPLE DATA ──────────────────────────────────────────────────────────
const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (productCount === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, unit, stock, min_stock, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
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
  products.forEach(p => insertProduct.run(...p));

  const insertCustomer = db.prepare(`
    INSERT INTO customers (name, phone, email, address, total_orders, total_spent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const customers = [
    ['Ravi Constructions', '9876543210', 'ravi@example.com', 'Gachibowli, Hyderabad', 3, 48500],
    ['Sri Sai Builders', '9876543211', 'saisai@example.com', 'Kondapur, Hyderabad', 5, 125000],
    ['Lakshmi Infra', '9876543212', '', 'Kukatpally, Hyderabad', 2, 22000],
    ['Venkat & Sons', '9876543213', 'venkat@example.com', 'Ameerpet, Hyderabad', 1, 9600],
  ];
  customers.forEach(c => insertCustomer.run(...c));

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, product_id, product_name, quantity, unit_price, total_amount, status, payment_status, delivery_address, order_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sampleOrders = [
    ['BRB-0001', 1, 'Ravi Constructions', '9876543210', 1, 'Standard Fly Ash Brick (9×4×3)', 5000, 5.5, 27500, 'Delivered', 'Paid', 'Gachibowli, Hyderabad', '2024-01-10 09:00:00'],
    ['BRB-0002', 2, 'Sri Sai Builders', '9876543211', 4, 'RMC M20 Grade', 20, 4800, 96000, 'Delivered', 'Paid', 'Kondapur, Hyderabad', '2024-01-12 10:30:00'],
    ['BRB-0003', 3, 'Lakshmi Infra', '9876543212', 2, 'Fly Ash Brick (9×4×2)', 4000, 4.8, 19200, 'Pending', 'Unpaid', 'Kukatpally, Hyderabad', '2024-01-14 11:00:00'],
    ['BRB-0004', 4, 'Venkat & Sons', '9876543213', 1, 'Standard Fly Ash Brick (9×4×3)', 2000, 5.5, 11000, 'Pending', 'Unpaid', 'Ameerpet, Hyderabad', '2024-01-15 14:00:00'],
    ['BRB-0005', 2, 'Sri Sai Builders', '9876543211', 5, 'RMC M25 Grade', 15, 5200, 78000, 'Delivered', 'Unpaid', 'Kondapur, Hyderabad', '2024-01-16 09:00:00'],
  ];
  sampleOrders.forEach(o => insertOrder.run(...o));
  console.log('✅ Sample data seeded');
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
function genOrderNum() {
  const count = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  return 'BRB-' + String(count + 1).padStart(4, '0');
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, email: admin.email });
});

app.post('/api/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, admin.password)) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ success: true });
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM orders WHERE payment_status='Paid'").get().t;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='Pending'").get().c;
  const unpaidAmount = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM orders WHERE payment_status='Unpaid'").get().t;
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const lowStock = db.prepare('SELECT COUNT(*) as c FROM products WHERE stock <= min_stock AND active=1').get().c;

  const recentOrders = db.prepare(`
    SELECT * FROM orders ORDER BY order_date DESC LIMIT 5
  `).all();

  const monthlyRevenue = db.prepare(`
    SELECT strftime('%Y-%m', order_date) as month,
           SUM(total_amount) as revenue,
           COUNT(*) as count
    FROM orders
    WHERE payment_status='Paid'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all();

  const topProducts = db.prepare(`
    SELECT product_name, SUM(quantity) as total_qty, SUM(total_amount) as total_rev, COUNT(*) as order_count
    FROM orders
    GROUP BY product_name
    ORDER BY total_rev DESC
    LIMIT 5
  `).all();

  res.json({ totalOrders, totalRevenue, pendingOrders, unpaidAmount, totalCustomers, lowStock, recentOrders, monthlyRevenue, topProducts });
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
app.get('/api/products', auth, (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE active=1 ORDER BY category, name').all();
  res.json(products);
});

app.post('/api/products', auth, (req, res) => {
  const { name, category, price, unit, stock, min_stock, description } = req.body;
  if (!name || !category || !price || !unit) return res.status(400).json({ error: 'Missing required fields' });
  const result = db.prepare(`
    INSERT INTO products (name, category, price, unit, stock, min_stock, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, price, unit, stock || 0, min_stock || 100, description || '');
  res.json({ id: result.lastInsertRowid, message: 'Product added' });
});

app.put('/api/products/:id', auth, (req, res) => {
  const { name, category, price, unit, stock, min_stock, description, active } = req.body;
  db.prepare(`
    UPDATE products SET name=?, category=?, price=?, unit=?, stock=?, min_stock=?, description=?, active=?
    WHERE id=?
  `).run(name, category, price, unit, stock, min_stock, description, active !== undefined ? active : 1, req.params.id);
  res.json({ message: 'Product updated' });
});

app.patch('/api/products/:id/stock', auth, (req, res) => {
  const { adjustment, type } = req.body;
  const product = db.prepare('SELECT stock FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const newStock = type === 'set' ? adjustment : product.stock + adjustment;
  if (newStock < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
  db.prepare('UPDATE products SET stock=? WHERE id=?').run(newStock, req.params.id);
  res.json({ stock: newStock });
});

app.delete('/api/products/:id', auth, (req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Product removed' });
});

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
app.get('/api/customers', auth, (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY total_spent DESC').all();
  res.json(customers);
});

app.post('/api/customers', auth, (req, res) => {
  const { name, phone, email, address, gst_number } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
  const existing = db.prepare('SELECT id FROM customers WHERE phone=?').get(phone);
  if (existing) return res.json({ id: existing.id, message: 'Customer already exists' });
  const result = db.prepare(`
    INSERT INTO customers (name, phone, email, address, gst_number)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, phone, email || '', address || '', gst_number || '');
  res.json({ id: result.lastInsertRowid, message: 'Customer added' });
});

app.put('/api/customers/:id', auth, (req, res) => {
  const { name, phone, email, address, gst_number } = req.body;
  db.prepare(`UPDATE customers SET name=?,phone=?,email=?,address=?,gst_number=? WHERE id=?`)
    .run(name, phone, email, address, gst_number, req.params.id);
  res.json({ message: 'Customer updated' });
});

app.get('/api/customers/:id/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY order_date DESC').all(req.params.id);
  res.json(orders);
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
app.get('/api/orders', auth, (req, res) => {
  const { status, payment, search, limit } = req.query;
  let q = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { q += ' AND status=?'; params.push(status); }
  if (payment) { q += ' AND payment_status=?'; params.push(payment); }
  if (search) { q += ' AND (customer_name LIKE ? OR order_number LIKE ? OR product_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  q += ' ORDER BY order_date DESC';
  if (limit) { q += ' LIMIT ?'; params.push(parseInt(limit)); }
  res.json(db.prepare(q).all(...params));
});

app.post('/api/orders', auth, (req, res) => {
  const { customer_name, customer_phone, product_id, quantity, delivery_address, notes } = req.body;
  if (!customer_name || !customer_phone || !product_id || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.stock < quantity) return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock} ${product.unit}` });

  const total_amount = product.price * quantity;
  const order_number = genOrderNum();

  let customer = db.prepare('SELECT id FROM customers WHERE phone=?').get(customer_phone);
  if (!customer) {
    const r = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(customer_name, customer_phone);
    customer = { id: r.lastInsertRowid };
  }

  const placeOrder = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, product_id, product_name, quantity, unit_price, total_amount, delivery_address, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_number, customer.id, customer_name, customer_phone, product_id, product.name, quantity, product.price, total_amount, delivery_address || '', notes || '');

    db.prepare('UPDATE products SET stock = stock - ? WHERE id=?').run(quantity, product_id);
    db.prepare('UPDATE customers SET total_orders = total_orders + 1 WHERE id=?').run(customer.id);

    return result;
  });

  const result = placeOrder();
  res.json({ id: result.lastInsertRowid, order_number, total_amount, message: 'Order created' });
});

app.get('/api/orders/:id', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.patch('/api/orders/:id/status', auth, (req, res) => {
  const { status } = req.body;
  const validStatus = ['Pending', 'Processing', 'Delivered', 'Cancelled'];
  if (!validStatus.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ message: 'Status updated' });
});

app.patch('/api/orders/:id/payment', auth, (req, res) => {
  const { payment_status, payment_method, notes } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(payment_status, req.params.id);

  if (payment_status === 'Paid') {
    db.prepare('INSERT INTO payments (order_id, amount, payment_method, notes) VALUES (?, ?, ?, ?)')
      .run(req.params.id, order.total_amount, payment_method || 'Cash', notes || '');
    db.prepare('UPDATE customers SET total_spent = total_spent + ? WHERE id=?')
      .run(order.total_amount, order.customer_id);
  }

  res.json({ message: 'Payment updated' });
});

app.delete('/api/orders/:id', auth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'Cancelled') {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(order.quantity, order.product_id);
  }
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  res.json({ message: 'Order deleted' });
});

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
app.get('/api/payments', auth, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, o.order_number, o.customer_name
    FROM payments p JOIN orders o ON p.order_id = o.id
    ORDER BY p.payment_date DESC LIMIT 50
  `).all();
  res.json(payments);
});

// ── INVENTORY ─────────────────────────────────────────────────────────────────
app.get('/api/inventory', auth, (req, res) => {
  const inventory = db.prepare(`
    SELECT *, CASE WHEN stock <= min_stock THEN 1 ELSE 0 END as low_stock
    FROM products WHERE active=1 ORDER BY low_stock DESC, category, name
  `).all();
  res.json(inventory);
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Balaji Readymix API running on http://localhost:${PORT}`);
  console.log(`📧 Admin: ${adminEmail}`);
  console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'balaji@123'}\n`);
});
