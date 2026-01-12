const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const port = 3000;
const app = express();

const mongoUrl = 'mongodb://127.0.0.1:27017/students';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(mongoUrl);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Database connected:',db.name);
});

app.use(
    session({
        secret: 'a secret key to sign the cookie',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: mongoUrl }),
        cookie: { maxAge: 1000 * 60 * 60 * 24 },
    })
);

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    productName: { type: String, required: true },
    size: { type: String, required: true },
    deliveryDate: { type: Date, required: true },
    deliveryAddress: { type: String, required: true },
    cardMessage: { type: String },
    totalPrice: { type: Number, required: true },
    orderDate: { type: Date, default: Date.now },
});
const Order = mongoose.model('Order', orderSchema);

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.password))) {
            req.session.user = { id: user._id, username: user.username, email: user.email };
            res.redirect('/');
        } else {
            res.render('login', { error: 'Invalid email or password.' });
        }
    } catch (error) {
        res.status(500).render('login', { error: 'An error occurred during login.' });
    }
});

app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('signup', { error: 'User with this email already exists.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = email.split('@')[0];
        const newUser = new User({ email, username, password: hashedPassword });
        await newUser.save();
        req.session.user = { id: newUser._id, username: newUser.username, email: newUser.email };
        res.redirect('/');
    } catch (error) {
        res.status(500).render('signup', { error: 'An error occurred during signup.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.redirect('/'); }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

app.post('/submit-order', requireLogin, async (req, res) => {
    try {
        const { productName, productPrice, size, deliveryDate, deliveryAddress, cardMessage } = req.body;
        const newOrder = new Order({
            userId: req.session.user.id,
            productName,
            size,
            deliveryDate,
            deliveryAddress,
            cardMessage,
            totalPrice: parseFloat(productPrice)
        });
        await newOrder.save();
        res.json({ success: true, redirectUrl: `/order-success/${newOrder._id}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to place order.' });
    }
});

app.get('/order-success/:orderId', requireLogin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order || order.userId.toString() !== req.session.user.id) {
            return res.status(404).send('Order not found.');
        }
        res.render('order-success', { order });
    } catch (error) {
        res.status(500).send('Error retrieving order details.');
    }
});

app.get('/order-history', requireLogin, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.session.user.id }).sort({ orderDate: -1 });
        res.render('order-history', { orders });
    } catch (error) {
        res.status(500).send('Error fetching order history.');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});