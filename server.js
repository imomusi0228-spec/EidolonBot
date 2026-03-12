require('dotenv').config();
const express = require('express');
const { startBot } = require('./src/bot');
const apiRouter = require('./src/api');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Keep-Alive / Health Check
app.get('/', (req, res) => {
    res.send("Bot running and serving Ojou-Sama.");
});

// API Routes
app.use('/api', apiRouter);

// Start Bot
startBot();

// Start Server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
