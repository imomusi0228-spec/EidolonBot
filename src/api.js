const express = require('express');
const prisma = require('./database');
const router = express.Router();

// POST /license/verify
router.post('/license/verify', async (req, res) => {
    const { license_key, discord_id, machine_id } = req.body;
    
    try {
        const license = await prisma.license.findUnique({
            where: { license_key },
            include: { user: true }
        });

        if (!license) {
            return res.status(404).json({ valid: false, error: "License not found" });
        }

        // ティア情報の正規化
        const tier = license.tier;
        const features = {
            autoRepair: tier === 'Complete',
            preview: ['Pro', 'Creator', 'Complete'].includes(tier),
            expressionGenerator: ['Pro', 'Creator', 'Complete'].includes(tier)
        };

        return res.json({
            valid: true,
            tier: tier,
            features: features,
            activated: license.activated
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// POST /license/activate
router.post('/license/activate', async (req, res) => {
    const { license_key, discord_id } = req.body;

    try {
        // ユーザーの検索または作成
        let user = await prisma.user.findUnique({
            where: { discord_id }
        });

        if (!user) {
            // ここでは簡易的にユーザー名を仮定
            user = await prisma.user.create({
                data: { discord_id, username: "Unknown" }
            });
        }

        const license = await prisma.license.update({
            where: { license_key },
            data: {
                activated: true,
                user_id: user.id
            }
        });

        res.json({ activation_status: "success", tier: license.tier });
    } catch (error) {
        console.error(error);
        res.status(400).json({ activation_status: "failed", error: error.message });
    }
});

// GET /update/check
router.get('/update/check', async (req, res) => {
    try {
        const latest = await prisma.version.findFirst({
            orderBy: { release_date: 'desc' }
        });
        res.json({
            latest_version: latest ? latest.tool_version : "1.0.0",
            download_url: latest ? latest.download_url : "https://booth.pm/ja/items/example"
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
