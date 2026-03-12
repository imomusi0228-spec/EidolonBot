const prisma = require('./src/database');

async function seed() {
    console.log("Seeding features...");
    
    const features = [
        { slug: "auto_repair", name: "Avatar Auto Repair", description: "Automatically fix FX layers and parameters." },
        { slug: "preview_system", name: "Live Preview", description: "Real-time face tracking preview in Editor." },
        { slug: "expression_generator", name: "Expression Generator", description: "Generate expression clips from ARKit params." },
        { slug: "blendshape_ai", name: "BlendShape AI", description: "AI-assisted blendshape mapping." },
        { slug: "quest_optimizer", name: "Quest Optimizer", description: "One-click optimization for Quest." },
        { slug: "batch_setup", name: "Batch Setup", description: "Bulk processing for multiple avatars." }
    ];

    for (const f of features) {
        await prisma.feature.upsert({
            where: { slug: f.slug },
            update: {},
            create: f
        });
    }

    console.log("Seeding complete.");
}

seed()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
