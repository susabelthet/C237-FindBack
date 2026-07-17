const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/browse', (req, res) => {
    res.send('Browse page will be created later.');
});

app.get('/report-item', (req, res) => {
    res.send('Report Item page will be created later.');
});

app.get('/login', (req, res) => {
    res.send('Login page will be created later.');
});

app.get('/register', (req, res) => {
    res.send('Register page will be created later.');
});

app.listen(PORT, () => {
    console.log(`FindBack is running at http://localhost:${PORT}`);
});