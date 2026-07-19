const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

require('dotenv').config();

const db = require('./dbConfig');

const multer = require('multer');

// Multer setup for item photos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname);
        cb(null, uniqueName + extension);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },   // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG or WEBP images are allowed.'));
        }
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET || 'findback-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

// Make logged-in user available to all EJS pages
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Check whether the user is logged in
function isLoggedIn(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    if (req.session.user.role !== 'admin') {
        return res.status(403).send('Access denied. Admin only.');
    }

    next();
}

// =========================================
// PUBLIC PAGES
// =========================================

// Home page
app.get('/', (req, res) => {
    const sql = `
        SELECT * FROM items
        ORDER BY created_at DESC
        LIMIT 4
    `;

    db.query(sql, (error, results) => {
        if (error) {
            console.error('Home page items error:', error);
            results = [];
        }

        res.render('index', {
            recentItems: results
        });
    });
});

// Browse all active items with search and filters
app.get('/browse', (req, res) => {
    const { search, category, type, location, colour, sort } = req.query;

    let sql = `
        SELECT items.*, users.full_name AS reporter_name
        FROM items
        JOIN users ON items.user_id = users.id
        WHERE items.status = 'active'
    `;
    const params = [];

    if (search) {
        sql += ` AND (items.item_name LIKE ? OR items.description LIKE ? OR items.location LIKE ?)`;
        const like = `%${search}%`;
        params.push(like, like, like);
    }

    if (category) {
        sql += ` AND items.category = ?`;
        params.push(category);
    }

    if (type) {
        sql += ` AND items.report_type = ?`;
        params.push(type);
    }

    if (location) {
        sql += ` AND items.location LIKE ?`;
        params.push(`%${location}%`);
    }

    if (colour) {
        sql += ` AND items.colour LIKE ?`;
        params.push(`%${colour}%`);
    }

    if (sort === 'oldest') {
        sql += ` ORDER BY items.created_at ASC`;
    } else {
        sql += ` ORDER BY items.created_at DESC`;
    }

    db.query(sql, params, (error, items) => {
        if (error) {
            console.error('Browse error:', error);
            items = [];
        }

        res.render('browse', {
            items,
            filters: {
                search: search || '',
                category: category || '',
                type: type || '',
                location: location || '',
                colour: colour || '',
                sort: sort || 'newest'
            }
        });
    });
});

// Item details page
app.get('/items/:id', (req, res) => {
    const sql = `
        SELECT items.*, users.full_name AS reporter_name
        FROM items
        JOIN users ON items.user_id = users.id
        WHERE items.id = ?
    `;

    db.query(sql, [req.params.id], (error, results) => {
        if (error) {
            console.error('Item details error:', error);
            return res.status(500).send('Something went wrong.');
        }

        if (results.length === 0) {
            return res.status(404).send('Item not found.');
        }

        res.render('itemDetails', {
            item: results[0]
        });
    });
});

// Report item: choose type page
app.get('/report-item', isLoggedIn, (req, res) => {
    res.render('reportChoose');
});

// Report lost item form
app.get('/report-item/lost', isLoggedIn, (req, res) => {
    res.render('reportLost', { error: null });
});

// Report found item form
app.get('/report-item/found', isLoggedIn, (req, res) => {
    res.render('reportFound', { error: null });
});

// Submit lost item report
app.post('/report-item/lost', isLoggedIn, (req, res) => {
    upload.single('image')(req, res, (uploadError) => {
        if (uploadError) {
            return res.render('reportLost', {
                error: uploadError.message
            });
        }

        const { itemName, category, colour, location, dateLost, description } = req.body;

        if (!itemName || !category || !location || !dateLost) {
            return res.render('reportLost', {
                error: 'Please fill in the item name, category, location and date.'
            });
        }

        const imageFilename = req.file ? req.file.filename : null;

        const sql = `
            INSERT INTO items
                (user_id, item_name, description, category, colour,
                 report_type, location, date_lost_found, image, status)
            VALUES (?, ?, ?, ?, ?, 'lost', ?, ?, ?, 'active')
        `;

        db.query(
            sql,
            [
                req.session.user.id,
                itemName,
                description || null,
                category,
                colour || null,
                location,
                dateLost,
                imageFilename
            ],
            (error) => {
                if (error) {
                    console.error('Report lost item error:', error);
                    return res.render('reportLost', {
                        error: 'Something went wrong. Please try again.'
                    });
                }

                res.redirect('/dashboard');
            }
        );
    });
});

// Submit found item report
app.post('/report-item/found', isLoggedIn, (req, res) => {
    upload.single('image')(req, res, (uploadError) => {
        if (uploadError) {
            return res.render('reportFound', {
                error: uploadError.message
            });
        }

        const { itemName, category, colour, location, dateFound, keptAt, description } = req.body;

        if (!itemName || !category || !location || !dateFound || !keptAt) {
            return res.render('reportFound', {
                error: 'Please fill in the item name, category, location, date and where the item is kept.'
            });
        }

        const imageFilename = req.file ? req.file.filename : null;

        const sql = `
            INSERT INTO items
                (user_id, item_name, description, category, colour,
                 report_type, location, date_lost_found, kept_at, image, status)
            VALUES (?, ?, ?, ?, ?, 'found', ?, ?, ?, ?, 'active')
        `;

        db.query(
            sql,
            [
                req.session.user.id,
                itemName,
                description || null,
                category,
                colour || null,
                location,
                dateFound,
                keptAt,
                imageFilename
            ],
            (error) => {
                if (error) {
                    console.error('Report found item error:', error);
                    return res.render('reportFound', {
                        error: 'Something went wrong. Please try again.'
                    });
                }

                res.redirect('/dashboard');
            }
        );
    });
});

// =========================================
// AUTH
// =========================================

// Register page
app.get('/register', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin');
        }

        return res.redirect('/dashboard');
    }

    res.render('register', {
        error: null,
        success: null
    });
});

// Register user
app.post('/register', async (req, res) => {
    const { fullName, studentId, email, password, confirmPassword } = req.body;

    if (!fullName || !studentId || !email || !password || !confirmPassword) {
        return res.render('register', {
            error: 'Please fill in all fields.',
            success: null
        });
    }

    if (password !== confirmPassword) {
        return res.render('register', {
            error: 'Passwords do not match.',
            success: null
        });
    }

    if (password.length < 8) {
        return res.render('register', {
            error: 'Password must contain at least 8 characters.',
            success: null
        });
    }

    const checkSql = `
        SELECT email, student_id
        FROM users
        WHERE email = ? OR student_id = ?
    `;

    db.query(checkSql, [email, studentId], async (error, results) => {
        if (error) {
            console.error('User check error:', error);

            return res.render('register', {
                error: 'Database error. Please try again.',
                success: null
            });
        }

        if (results.length > 0) {
            const taken = results[0].email === email
                ? 'This email is already registered.'
                : 'This student ID is already registered.';

            return res.render('register', {
                error: taken,
                success: null
            });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            const insertSql = `
                INSERT INTO users (full_name, student_id, email, password, role)
                VALUES (?, ?, ?, ?, 'user')
            `;

            db.query(
                insertSql,
                [fullName, studentId, email, hashedPassword],
                (insertError) => {
                    if (insertError) {
                        console.error('Registration error:', insertError);

                        return res.render('register', {
                            error: 'Registration failed. Please try again.',
                            success: null
                        });
                    }

                    return res.render('register', {
                        error: null,
                        success: 'Registration successful. You can now log in.'
                    });
                }
            );
        } catch (hashError) {
            console.error('Password hashing error:', hashError);

            return res.render('register', {
                error: 'Registration failed. Please try again.',
                success: null
            });
        }
    });
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin');
        }

        return res.redirect('/dashboard');
    }

    res.render('login', {
        error: null
    });
});

// Login user
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', {
            error: 'Please enter your email and password.'
        });
    }

    const sql = 'SELECT * FROM users WHERE email = ?';

    db.query(sql, [email], async (error, results) => {
        if (error) {
            console.error('Login database error:', error);

            return res.render('login', {
                error: 'Database error. Please try again.'
            });
        }

        if (results.length === 0) {
            return res.render('login', {
                error: 'Invalid email or password.'
            });
        }

        const user = results[0];

        try {
            const passwordMatches = await bcrypt.compare(
                password,
                user.password
            );

            if (!passwordMatches) {
                return res.render('login', {
                    error: 'Invalid email or password.'
                });
            }

            req.session.user = {
                id: user.id,
                full_name: user.full_name,
                student_id: user.student_id,
                email: user.email,
                role: user.role
            };

            if (user.role === 'admin') {
                return res.redirect('/admin');
            }

            return res.redirect('/dashboard');
        } catch (compareError) {
            console.error('Password comparison error:', compareError);

            return res.render('login', {
                error: 'Login failed. Please try again.'
            });
        }
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Logout error:', error);
            return res.redirect('/dashboard');
        }

        res.clearCookie('connect.sid');
        return res.redirect('/');
    });
});

// =========================================
// USER DASHBOARD
// =========================================

app.get('/dashboard', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;

    const reportsSql = `
        SELECT * FROM items
        WHERE user_id = ?
        ORDER BY created_at DESC
    `;

    const claimsSql = `
        SELECT claims.*, items.item_name
        FROM claims
        JOIN items ON claims.item_id = items.id
        WHERE claims.claimant_id = ?
        ORDER BY claims.created_at DESC
    `;

    db.query(reportsSql, [userId], (reportsError, myReports) => {
        if (reportsError) {
            console.error('Dashboard reports error:', reportsError);
            myReports = [];
        }

        db.query(claimsSql, [userId], (claimsError, myClaims) => {
            if (claimsError) {
                console.error('Dashboard claims error:', claimsError);
                myClaims = [];
            }

            const stats = {
                myReports: myReports.length,
                pendingClaims: myClaims.filter(c => c.status === 'pending').length,
                approvedClaims: myClaims.filter(c => c.status === 'approved').length,
                rejectedClaims: myClaims.filter(c => c.status === 'rejected').length
            };

            res.render('dashboard', {
                stats,
                myReports,
                myClaims
            });
        });
    });
});

// =========================================
// ADMIN
// =========================================

app.get('/admin', isAdmin, (req, res) => {
    const statsSql = `
        SELECT
            (SELECT COUNT(*) FROM users) AS totalUsers,
            (SELECT COUNT(*) FROM items WHERE status = 'active') AS activeReports,
            (SELECT COUNT(*) FROM claims WHERE status = 'pending') AS pendingClaims,
            (SELECT COUNT(*) FROM items WHERE status = 'returned') AS returnedItems
    `;

    const claimsSql = `
        SELECT claims.*, items.item_name, users.full_name AS claimant_name
        FROM claims
        JOIN items ON claims.item_id = items.id
        JOIN users ON claims.claimant_id = users.id
        WHERE claims.status = 'pending'
        ORDER BY claims.created_at DESC
        LIMIT 5
    `;

    const reportsSql = `
        SELECT items.*, users.full_name AS reporter_name
        FROM items
        JOIN users ON items.user_id = users.id
        ORDER BY items.created_at DESC
        LIMIT 5
    `;

    db.query(statsSql, (statsError, statsResults) => {
        if (statsError) {
            console.error('Admin stats error:', statsError);
            statsResults = [{
                totalUsers: 0,
                activeReports: 0,
                pendingClaims: 0,
                returnedItems: 0
            }];
        }

        db.query(claimsSql, (claimsError, pendingClaims) => {
            if (claimsError) {
                console.error('Admin claims error:', claimsError);
                pendingClaims = [];
            }

            db.query(reportsSql, (reportsError, recentReports) => {
                if (reportsError) {
                    console.error('Admin reports error:', reportsError);
                    recentReports = [];
                }

                res.render('adminDashboard', {
                    stats: statsResults[0],
                    pendingClaims,
                    recentReports
                });
            });
        });
    });
});

// Temporary admin pages (to be built)
app.get('/admin/claims', isAdmin, (req, res) => {
    res.send('Admin claims page will be created later.');
});

app.get('/admin/reports', isAdmin, (req, res) => {
    res.send('Admin reports page will be created later.');
});

// =========================================
// 404 + SERVER
// =========================================

// Page not found
app.use((req, res) => {
    res.status(404).send('Page not found.');
});

// Start server
app.listen(PORT, () => {
    console.log(`FindBack is running at http://localhost:${PORT}`);
});