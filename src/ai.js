const express = require('express');
const prisma = require('./database');
const router = express.Router();

// --- Phase 5: AI Services ---

// POST /ai/repair
router.post('/repair', async (req, res) => {
    const { discord_id, data } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { discord_id } });
        const job = await prisma.aIJob.create({
            data: { user_id: user.id, type: "repair", status: "pending", input_data: data }
        });
        res.json({ job_id: job.id, message: "Repair job submitted." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /ai/status/:job_id
router.get('/status/:job_id', async (req, res) => {
    try {
        const job = await prisma.aIJob.findUnique({
            where: { id: parseInt(req.params.job_id) }
        });
        res.json(job);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
