const express = require('express');
const prisma = require('./database');
const router = express.Router();

// POST /license/verify
router.post('/license/verify', async (req, res) => {
    const { license_key, discord_id, machine_id } = req.body;
    
    try {
        const license = await prisma.license.findUnique({
            where: { license_key },
            include: { user: { include: { UserFeatures: { include: { feature: true } } } } }
        });

        if (!license) {
            return res.status(404).json({ valid: false, error: "License not found" });
        }

        // 基本ティアに基づく機能の一覧性
        const tier = license.tier;
        const baseFeatures = {
            autoRepair: tier === 'Complete',
            preview: ['Pro', 'Creator', 'Complete'].includes(tier),
            expressionGenerator: ['Pro', 'Creator', 'Complete'].includes(tier)
        };

        // DBに登録された追加機能（DLC）の取得
        const additionalFeatures = license.user ? license.user.UserFeatures.map(uf => uf.feature.slug) : [];

        return res.json({
            valid: true,
            tier: tier,
            baseFeatures: baseFeatures,
            additionalFeatures: additionalFeatures,
            activated: license.activated
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET /features (Phase 3: DLC List)
router.get('/features', async (req, res) => {
    try {
        const features = await prisma.feature.findMany();
        res.json(features);
    } catch (error) {
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
