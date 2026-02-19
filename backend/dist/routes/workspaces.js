"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacesRoutes = workspacesRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
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
async function workspacesRoutes(fastify, _opts) {
    fastify.get("/workspaces", async (request, reply) => {
        const authHeader = request.headers.authorization;
        let userId = null;
        let reason = null;
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice("Bearer ".length);
            try {
                const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
                userId = payload.sub;
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
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
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
        }));
        const active = workspaces.find((w) => w.id === user.active_workspace_id) ?? null;
        return reply.send({
            workspaces,
            activeWorkspaceId: user.active_workspace_id,
            activeWorkspace: active,
        });
    });
    fastify.post("/workspaces", async (request, reply) => {
        const authHeader = request.headers.authorization;
        let userId = null;
        let reason = null;
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice("Bearer ".length);
            try {
                const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
                userId = payload.sub;
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
            userId = auth.userId;
        }
        const body = request.body;
        if (body?.type !== "family") {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_type" });
        }
        const name = body.name ?? null;
        const workspace = await prisma_1.prisma.$transaction(async (tx) => {
            const created = await tx.workspaces.create({
                data: {
                    type: "family",
                    name,
                    created_by_user_id: userId,
                },
            });
            await tx.categories.createMany({
                data: DEFAULT_CATEGORIES.map((c) => ({
                    workspace_id: created.id,
                    name: c.name,
                    kind: c.kind,
                    icon: null,
                })),
                skipDuplicates: true,
            });
            await tx.income_sources.createMany({
                data: DEFAULT_INCOME_SOURCES.map((s) => ({
                    workspace_id: created.id,
                    name: s.name,
                })),
                skipDuplicates: true,
            });
            await tx.workspace_members.create({
                data: {
                    workspace_id: created.id,
                    user_id: userId,
                    role: "owner",
                },
            });
            return created;
        });
        return reply.send({
            workspace: {
                id: workspace.id,
                type: workspace.type,
                name: workspace.name,
            },
        });
    });
    fastify.patch("/workspaces/active", async (request, reply) => {
        const authHeader = request.headers.authorization;
        let userId = null;
        let reason = null;
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice("Bearer ".length);
            try {
                const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
                userId = payload.sub;
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
            userId = auth.userId;
        }
        const body = request.body;
        const workspaceId = body?.workspaceId;
        if (!workspaceId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" });
        }
        const workspace = await prisma_1.prisma.workspaces.findUnique({ where: { id: workspaceId } });
        if (!workspace) {
            return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" });
        }
        const membership = await prisma_1.prisma.workspace_members.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId,
                },
            },
        });
        if (!membership) {
            return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" });
        }
        await prisma_1.prisma.users.update({
            where: { id: userId },
            data: { active_workspace_id: workspaceId },
        });
        return reply.send({
            activeWorkspaceId: workspaceId,
            activeWorkspace: {
                id: workspace.id,
                type: workspace.type,
                name: workspace.name,
            },
        });
    });
}
