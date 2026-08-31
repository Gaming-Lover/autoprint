const fs = require("fs");
const code = `const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "db.json");

function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString("hex");
  }
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initDb = {
        settings: {
          is_configured: false,
          shop_name: "My Print Kiosk",
          razorpay_key_id: "",
          razorpay_key_secret: "",
          bw_rate: 2,
          color_rate: 10
        },
        users: [],
        orders: []
      };
      saveDb(initDb);
      return initDb;
    }
    const data = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database:", err);
    return {
      settings: { is_configured: false, shop_name: "My Print Kiosk", razorpay_key_id: "", razorpay_key_secret: "", bw_rate: 2, color_rate: 10 },
      users: [],
      orders: []
    };
  }
}

function saveDb(data) {
  const tmpPath = DB_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, DB_PATH);
}

const DB = {
  isConfigured() {
    const db = readDb();
    return !!(db.settings && db.settings.is_configured && db.users.length > 0);
  },

  setupInitial(config) {
    const db = readDb();
    const { admin_id, password, shop_name, razorpay_key_id, razorpay_key_secret, bw_rate, color_rate } = config;
    const { hash, salt } = hashPassword(password);

    db.users = [{
      id: "usr_" + Date.now(),
      username: admin_id,
      password_hash: hash,
      salt: salt,
      created_at: new Date().toISOString()
    }];

    db.settings = {
      is_configured: true,
      shop_name: shop_name || "My Print Shop",
      razorpay_key_id: razorpay_key_id || "",
      razorpay_key_secret: razorpay_key_secret || "",
      bw_rate: parseFloat(bw_rate) || 2,
      color_rate: parseFloat(color_rate) || 10
    };

    saveDb(db);
    return { success: true };
  },

  authenticateUser(username, password) {
    const db = readDb();
    const user = db.users.find(u => u.username === username);
    if (!user) return false;
    const { hash } = hashPassword(password, user.salt);
    return hash === user.password_hash;
  },

  getSettings() {
    const db = readDb();
    const s = db.settings || {};
    return {
      is_configured: !!s.is_configured,
      shop_name: s.shop_name || "My Print Shop",
      razorpay_key_id: s.razorpay_key_id || "",
      razorpay_key_secret: s.razorpay_key_secret || "",
      bw_rate: s.bw_rate || 2,
      color_rate: s.color_rate || 10
    };
  },

  updateSettings(newSettings) {
    const db = readDb();
    if (newSettings.shop_name !== undefined) db.settings.shop_name = newSettings.shop_name;
    if (newSettings.razorpay_key_id !== undefined) db.settings.razorpay_key_id = newSettings.razorpay_key_id;
    if (newSettings.razorpay_key_secret !== undefined) db.settings.razorpay_key_secret = newSettings.razorpay_key_secret;
    if (newSettings.bw_rate !== undefined) db.settings.bw_rate = parseFloat(newSettings.bw_rate);
    if (newSettings.color_rate !== undefined) db.settings.color_rate = parseFloat(newSettings.color_rate);
    saveDb(db);
    return db.settings;
  },

  createOrder(orderData) {
    const db = readDb();
    const id = "ord_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    const newOrder = {
      id,
      customer_session_id: orderData.customer_session_id || ("cust_" + Math.random().toString(36).substr(2, 7)),
      filename: orderData.filename,
      original_name: orderData.original_name,
      file_path: orderData.file_path,
      page_count: parseInt(orderData.page_count) || 1,
      color_mode: orderData.color_mode || "bw",
      copies: parseInt(orderData.copies) || 1,
      rate_per_page: parseFloat(orderData.rate_per_page) || 2,
      total_amount: parseFloat(orderData.total_amount) || 0,
      payment_status: "pending",
      razorpay_order_id: orderData.razorpay_order_id || "",
      razorpay_payment_id: "",
      print_status: "pending",
      created_at: new Date().toISOString()
    };
    db.orders.push(newOrder);
    saveDb(db);
    return newOrder;
  },

  updateOrderPayment(orderId, paymentId, razorpayOrderId, status) {
    const db = readDb();
    const order = db.orders.find(o => o.id === orderId || (razorpayOrderId && o.razorpay_order_id === razorpayOrderId));
    if (order) {
      order.payment_status = status;
      if (paymentId) order.razorpay_payment_id = paymentId;
      order.updated_at = new Date().toISOString();
      saveDb(db);
      return order;
    }
    return null;
  },

  updateOrderPrintStatus(orderId, printStatus) {
    const db = readDb();
    const order = db.orders.find(o => o.id === orderId || o.razorpay_order_id === orderId);
    if (order) {
      order.print_status = printStatus;
      order.printed_at = new Date().toISOString();
      saveDb(db);
      return order;
    }
    return null;
  },

  getOrder(orderId) {
    const db = readDb();
    return db.orders.find(o => o.id === orderId || o.razorpay_order_id === orderId) || null;
  },

  getDashboardStats() {
    const db = readDb();
    const paidList = db.orders.filter(o => o.payment_status === "success" || o.payment_status === "completed");
    const uniqueCustomers = new Set(paidList.map(o => o.customer_session_id)).size;
    const totalPrintouts = paidList.reduce((sum, o) => sum + (o.page_count * o.copies), 0);
    const totalPayments = paidList.reduce((sum, o) => sum + o.total_amount, 0);
    return {
      total_customers: uniqueCustomers,
      total_printouts: totalPrintouts,
      total_payments: totalPayments,
      recent_orders: db.orders.slice(-15).reverse()
    };
  },

  resetDatabase(adminPassword) {
    const db = readDb();
    if (db.users && db.users.length > 0) {
      const admin = db.users[0];
      const { hash } = hashPassword(adminPassword, admin.salt);
      if (hash !== admin.password_hash) {
        return { success: false, message: "Invalid admin password" };
      }
    }
    const resetDb = {
      settings: {
        is_configured: false,
        shop_name: "My Print Shop",
        razorpay_key_id: "",
        razorpay_key_secret: "",
        bw_rate: 2,
        color_rate: 10
      },
      users: [],
      orders: []
    };
    saveDb(resetDb);
    return { success: true };
  }
};

module.exports = DB;
`;
fs.writeFileSync("db.js", code, "utf8");

