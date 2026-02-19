"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.meRoutes = meRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
async function meRoutes(fastify, _opts) {
    fastify.get("/me", async (request, reply) => {
        const authHeader = request.headers.authorization;
        let userId = null;
        let telegramUserId = null;
        let reason = null;
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice("Bearer ".length);
            try {
                const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
                userId = payload.sub;
                telegramUserId = payload.telegramUserId ?? null;
            }
            catch {
                reason = "invalid_jwt";
                return reply.status(401).send({ error: "Unauthorized", reason });
            }
        }
        if (!userId) {
            const initDataRaw = request.headers[telegramAuth_1.TELEGRAM_INITDATA_HEADER];
            const hasInitData = Boolean(initDataRaw && initDataRaw.length > 0);
            const authDate = (() => {
                const params = initDataRaw ? new URLSearchParams(initDataRaw) : null;
                const ad = params?.get("auth_date");
                return ad ? Number(ad) : undefined;
            })();
            if (!env_1.env.BOT_TOKEN) {
                reason = "missing_bot_token";
                request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
                return reply.status(401).send({ error: "Unauthorized", reason });
            }
            const auth = await (0, telegramAuth_1.validateInitData)(initDataRaw);
            if (!auth) {
                reason = hasInitData ? "invalid_initdata" : "missing_initdata";
                request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
                return reply.status(401).send({ error: "Unauthorized", reason });
            }
            request.log.info({
                hasInitData,
                initDataLength: initDataRaw?.length ?? 0,
                authDate,
                userId: auth.telegramUserId,
                reason: "ok",
            });
            userId = auth.userId;
            telegramUserId = auth.telegramUserId;
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                telegram_user_id: true,
                first_name: true,
                username: true,
                active_workspace_id: true,
            },
        });
        if (!user) {
            return reply.status(401).send({ error: "Unauthorized", reason: reason ?? "invalid_initdata" });
        }
        const memberships = await prisma_1.prisma.workspace_members.findMany({
            where: { user_id: user.id },
            include: {
                workspaces: true,
            },
        });
        const workspaces = memberships.map((m) => ({
            id: m.workspace_id,
            type: m.workspaces.type,
            name: m.workspaces.name,
            role: m.role,
        }));
        return reply.send({
            user: {
                telegramUserId: telegramUserId ?? user.telegram_user_id,
                firstName: user.first_name ?? undefined,
                username: user.username ?? undefined,
            },
            activeWorkspaceId: user.active_workspace_id,
            workspaces,
        });
    });
}
