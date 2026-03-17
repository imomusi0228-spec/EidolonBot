const express = require('express');
const prisma = require('./database');
const router = express.Router();

// --- Phase 4: Cloud Settings ---

// GET /settings/:discord_id
router.get('/settings/:discord_id', async (req, res) => {
    try {
        const setting = await prisma.userSetting.findFirst({
            where: { user: { discord_id: req.params.discord_id } }
        });
        res.json(setting ? setting.settings : {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /settings
router.post('/settings', async (req, res) => {
    const { discord_id, settings } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { discord_id } });
        if (!user) return res.status(404).json({ error: "User not found" });

        await prisma.userSetting.upsert({
            where: { user_id: user.id },
            update: { settings },
            create: { user_id: user.id, settings }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /presets/:discord_id
router.get('/presets/:discord_id', async (req, res) => {
    try {
        const presets = await prisma.preset.findMany({
            where: { user: { discord_id: req.params.discord_id } }
        });
        res.json(presets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /presets
router.post('/presets', async (req, res) => {
    const { discord_id, name, data } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { discord_id } });
        if (!user) return res.status(404).json({ error: "User not found" });

        const preset = await prisma.preset.create({
            data: { user_id: user.id, name, data }
        });
        res.json(preset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
