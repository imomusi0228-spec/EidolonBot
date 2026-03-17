const express = require('express');
const prisma = require('./database');
const router = express.Router();

// --- Phase 6: Analytics ---

// POST /analytics/log
router.post('/log', async (req, res) => {
    const { discord_id, event, props } = req.body;
    try {
        let user_id = null;
        if (discord_id) {
            const user = await prisma.user.findUnique({ where: { discord_id } });
            user_id = user ? user.id : null;
        }
        await prisma.analyticsEvent.create({
            data: { user_id, event_name: event, properties: props }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
