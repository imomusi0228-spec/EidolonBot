const express = require('express');
const prisma = require('./database');
const router = express.Router();

// --- Phase 7: Creator Ecosystem ---

// POST /creator/assets
router.post('/assets', async (req, res) => {
    const { discord_id, name, download_url, desc } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { discord_id } });
        const asset = await prisma.asset.create({
            data: { creator_id: user.id, name, download_url, description: desc }
        });
        res.json(asset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /creator/assets
router.get('/assets', async (req, res) => {
    try {
        const assets = await prisma.asset.findMany({ include: { creator: true } });
        res.json(assets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
