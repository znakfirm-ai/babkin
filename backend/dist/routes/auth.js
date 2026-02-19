"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../db/prisma");
const env_1 = require("../env");
const telegramAuth_1 = require("../middleware/telegramAuth");
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
const DEFAULT_INCOME_SOURCES = [{ name: "Зарплата" }, { name: "Бизнес" }];
async function authRoutes(fastify, _opts) {
    fastify.post("/auth/telegram", async (request, reply) => {
        const initDataRaw = request.headers[telegramAuth_1.TELEGRAM_INITDATA_HEADER];
        const hasInitData = Boolean(initDataRaw && initDataRaw.length > 0);
        const authDate = (() => {
            const params = initDataRaw ? new URLSearchParams(initDataRaw) : null;
            const ad = params?.get("auth_date");
            return ad ? Number(ad) : undefined;
        })();
        if (!env_1.env.BOT_TOKEN) {
            fastify.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason: "missing_bot_token" });
            return reply.status(401).send({ error: "Unauthorized", reason: "missing_bot_token" });
        }
        const auth = await (0, telegramAuth_1.validateInitData)(initDataRaw);
        if (!auth) {
            fastify.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason: "invalid_initdata" });
            return reply.status(401).send({ error: "Unauthorized", reason: hasInitData ? "invalid_initdata" : "missing_initdata" });
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: auth.userId },
            select: {
                id: true,
                telegram_user_id: true,
                first_name: true,
                username: true,
                active_workspace_id: true,
            },
        });
        if (!user) {
            fastify.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason: "invalid_initdata" });
            return reply.status(401).send({ error: "Unauthorized", reason: "invalid_initdata" });
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            const membershipCount = await tx.workspace_members.count({ where: { user_id: user.id } });
            if (membershipCount === 0) {
                const workspace = await tx.workspaces.create({
                    data: {
                        type: "personal",
                        name: null,
                        created_by_user_id: user.id,
                    },
                });
                await tx.categories.createMany({
                    data: DEFAULT_CATEGORIES.map((c) => ({
                        id: undefined,
                        workspace_id: workspace.id,
                        name: c.name,
                        kind: c.kind,
                        icon: null,
                    })),
                    skipDuplicates: true,
                });
                await tx.income_sources.createMany({
                    data: DEFAULT_INCOME_SOURCES.map((s) => ({
                        workspace_id: workspace.id,
                        name: s.name,
                    })),
                    skipDuplicates: true,
                });
                await tx.workspace_members.create({
                    data: { workspace_id: workspace.id, user_id: user.id, role: "owner" },
                });
                await tx.users.update({
                    where: { id: user.id },
                    data: { active_workspace_id: workspace.id },
                });
            }
        });
        const memberships = await prisma_1.prisma.workspace_members.findMany({
            where: { user_id: auth.userId },
            include: { workspaces: true },
        });
        const workspaces = memberships.map((m) => ({
            id: m.workspace_id,
            type: m.workspaces.type,
            name: m.workspaces.name,
            role: m.role,
        }));
        const accessToken = jsonwebtoken_1.default.sign({
            sub: user.id,
            telegramUserId: user.telegram_user_id,
        }, env_1.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "30d" });
        return reply.send({
            accessToken,
            user: {
                telegramUserId: user.telegram_user_id,
                firstName: user.first_name ?? undefined,
                username: user.username ?? undefined,
            },
            activeWorkspaceId: user.active_workspace_id,
            workspaces,
        });
    });
}
