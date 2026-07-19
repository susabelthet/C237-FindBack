const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

require('dotenv').config();

const db = require('./dbConfig');

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

// Temporary browse page (to be built)
app.get('/browse', (req, res) => {
    res.send('Browse page will be created later.');
});

// Temporary report item page (to be built)
app.get('/report-item', isLoggedIn, (req, res) => {
    res.send('Report Item page will be created later.');
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