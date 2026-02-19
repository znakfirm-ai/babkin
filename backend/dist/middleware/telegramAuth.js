"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TELEGRAM_INITDATA_HEADER = void 0;
exports.validateInitData = validateInitData;
exports.telegramAuth = telegramAuth;
const crypto_1 = __importDefault(require("crypto"));
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
async function telegramAuth(request, reply) {
    const initDataRaw = request.headers[exports.TELEGRAM_INITDATA_HEADER];
    const auth = await validateInitData(initDataRaw);
    if (!auth) {
        return reply.status(401).send({ error: "Unauthorized" });
    }
    request.auth = auth;
}
