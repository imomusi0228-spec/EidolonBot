const prisma = require('./database');
const crypto = require('crypto');

async function generateOwnerLicense() {
    const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
    const licenseKey = `EMULT-${randomPart}`;

    try {
        const license = await prisma.license.create({
            data: {
                license_key: licenseKey,
                tier: 'Ultimate',
                status: 'Active',
                activated: false
            }
        });
        console.log(`OWNER_LICENSE_KEY: ${license.license_key}`);
    } catch (error) {
        console.error("License generation failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

generateOwnerLicense();
