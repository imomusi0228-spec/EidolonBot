require('dotenv').config();
const express = require('express');
const path = require('path');
const { startBot } = require('./bot');
const apiRouter = require('./api');
const cloudRouter = require('./cloud');
const aiRouter = require('./ai');
const analyticsRouter = require('./analytics');
const creatorRouter = require('./creator');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.send("Bot running and serving Ojou-Sama. [v2.0.1]");
});

// API Routes
app.use('/api', apiRouter);
app.use('/api/cloud', cloudRouter);
app.use('/api/ai', aiRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/creator', creatorRouter);

// Start Bot
startBot();

// Start Server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
