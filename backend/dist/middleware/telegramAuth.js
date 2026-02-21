"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TELEGRAM_INITDATA_HEADER = void 0;
exports.validateInitData = validateInitData;
exports.telegramAuth = telegramAuth;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const env_1 = require("../env");
exports.TELEGRAM_INITDATA_HEADER = "x-telegram-initdata";
function parseInitData(initData) {
    if (!initData)
        return null;
    return new URLSearchParams(initData);
}
function computeSignature(params) {
    const pairs = [];
    let hash;
    params.forEach((value, key) => {
        if (key === "hash") {
            hash = value;
        }
        else {
            pairs.push(`${key}=${value}`);
        }
    });
    pairs.sort();
    return { hash, dataCheckString: pairs.join("\n") };
}
function timingSafeEqualHex(a, b) {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length)
        return false;
    return crypto_1.default.timingSafeEqual(bufA, bufB);
}
function isSignatureValid(params, botToken) {
    const { hash, dataCheckString } = computeSignature(params);
    if (!hash)
        return false;
    const secretKey = crypto_1.default.createHmac("sha256", "WebAppData").update(botToken).digest();
    const hmac = crypto_1.default.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    return timingSafeEqualHex(hmac, hash);
}
async function ensureUserAndWorkspace(tgUser) {
    const telegramUserId = String(tgUser.id);
    const firstName = tgUser.first_name ?? null;
    const username = tgUser.username ?? null;
    const user = await prisma_1.prisma.users.upsert({
        where: { telegram_user_id: telegramUserId },
        create: { telegram_user_id: telegramUserId, first_name: firstName, username },
        update: { first_name: firstName, username },
    });
    let activeWorkspaceId = user.active_workspace_id;
    if (!activeWorkspaceId) {
        const personal = await prisma_1.prisma.workspaces.create({
            data: {
                type: "personal",
                name: null,
                created_by_user_id: user.id,
                workspace_members: {
                    create: { user_id: user.id, role: "owner" },
                },
            },
        });
        await seedWorkspaceDefaults(personal.id);
        await prisma_1.prisma.users.update({
            where: { id: user.id },
            data: { active_workspace_id: personal.id },
        });
        activeWorkspaceId = personal.id;
    }
    return {
        userId: user.id,
        telegramUserId,
        activeWorkspaceId,
    };
}
async function validateInitData(initDataRaw) {
    const params = parseInitData(initDataRaw ?? null);
    if (!params) {
        return null;
    }
    if (!isSignatureValid(params, env_1.env.BOT_TOKEN)) {
        return null;
    }
    const userJson = params.get("user");
    if (!userJson) {
        return null;
    }
    let tgUser = null;
    try {
        tgUser = JSON.parse(userJson);
    }
    catch {
        return null;
    }
    if (!tgUser || typeof tgUser.id !== "number") {
        return null;
    }
    return ensureUserAndWorkspace(tgUser);
}
async function seedWorkspaceDefaults(workspaceId) {
    const DEFAULT_CATEGORIES = [
        { name: "Еда", kind: "expense" },
        { name: "Транспорт", kind: "expense" },
        { name: "Дом", kind: "expense" },
        { name: "Развлечения", kind: "expense" },
        { name: "Здоровье", kind: "expense" },
        { name: "Покупки", kind: "expense" },
        { name: "Зарплата", kind: "income" },
        { name: "Бизнес", kind: "income" },
        { name: "Подарки", kind: "income" },
    ];
    await prisma_1.prisma.$transaction(async (tx) => {
        const accountsCount = await tx.accounts.count({ where: { workspace_id: workspaceId } });
        if (accountsCount === 0) {
            await tx.accounts.createMany({
                data: [
                    { workspace_id: workspaceId, name: "Наличные", type: "cash", currency: "RUB", balance: 0, color: "#EEF2F7", icon: "cash" },
                    { workspace_id: workspaceId, name: "Банк", type: "bank", currency: "RUB", balance: 0, color: "#2563eb", icon: "bank" },
                ],
                skipDuplicates: true,
            });
        }
        const incomeCount = await tx.income_sources.count({ where: { workspace_id: workspaceId } });
        if (incomeCount === 0) {
            await tx.income_sources.createMany({
                data: [
                    { workspace_id: workspaceId, name: "Зарплата", icon: "salary" },
                    { workspace_id: workspaceId, name: "Бизнес", icon: "business" },
                    { workspace_id: workspaceId, name: "Прочие", icon: "other" },
                ],
                skipDuplicates: true,
            });
        }
        const categoriesCount = await tx.categories.count({ where: { workspace_id: workspaceId } });
        if (categoriesCount === 0) {
            const iconMap = {
                "Еда": "groceries",
                "Транспорт": "transport",
                "Дом": "home",
                "Развлечения": "entertainment",
                "Здоровье": "health",
                "Покупки": "shopping",
                "Зарплата": "salary",
                "Бизнес": "business",
                "Подарки": "gift_income",
            };
            await tx.categories.createMany({
                data: DEFAULT_CATEGORIES.map((c) => ({
                    workspace_id: workspaceId,
                    name: c.name,
                    kind: c.kind,
                    icon: iconMap[c.name] ?? null,
                })),
                skipDuplicates: true,
            });
        }
        const goalsCount = await tx.goals.count({ where: { workspace_id: workspaceId } });
        if (goalsCount === 0) {
            await tx.goals.create({
                data: {
                    workspace_id: workspaceId,
                    name: "Моя цель",
                    icon: "target",
                    target_amount: new client_1.Prisma.Decimal(0),
                },
            });
        }
        // TODO: add default debts/credits once the model and endpoints are available
    });
}
async function telegramAuth(request, reply) {
    const initDataRaw = request.headers[exports.TELEGRAM_INITDATA_HEADER];
    const auth = await validateInitData(initDataRaw);
    if (!auth) {
        return reply.status(401).send({ error: "Unauthorized" });
    }
    request.auth = auth;
}
