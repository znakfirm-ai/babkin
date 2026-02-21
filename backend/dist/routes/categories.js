"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRoutes = categoriesRoutes;
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
const unauthorized = async (reply, reason) => {
    await reply.status(401).send({ error: "Unauthorized", reason });
    return null;
};
async function resolveUserId(request, reply) {
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
            return unauthorized(reply, reason);
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
            return unauthorized(reply, reason);
        }
        const auth = await (0, telegramAuth_1.validateInitData)(initDataRaw);
        if (!auth) {
            reason = hasInitData ? "invalid_initdata" : "missing_initdata";
            request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
            return unauthorized(reply, reason);
        }
        userId = auth.userId;
    }
    return userId;
}
async function categoriesRoutes(fastify, _opts) {
    fastify.get("/categories", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const workspaceId = user.active_workspace_id;
        const existing = await prisma_1.prisma.categories.findMany({
            where: { workspace_id: workspaceId },
            select: { id: true, name: true, kind: true, icon: true, budget: true },
        });
        if (existing.length === 0) {
            await prisma_1.prisma.categories.createMany({
                data: DEFAULT_CATEGORIES.map((c) => ({
                    workspace_id: workspaceId,
                    name: c.name,
                    kind: c.kind,
                    icon: null,
                })),
                skipDuplicates: true,
            });
        }
        const categories = existing.length
            ? existing
            : await prisma_1.prisma.categories.findMany({
                where: { workspace_id: workspaceId },
                select: { id: true, name: true, kind: true, icon: true, budget: true },
            });
        const payload = {
            categories: categories.map((c) => ({
                id: c.id,
                name: c.name,
                kind: c.kind,
                icon: c.icon,
                budget: c.budget ? Number(c.budget) : null,
            })),
        };
        return reply.send(payload);
    });
    fastify.post("/categories", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const body = request.body;
        const name = body?.name?.trim();
        const kind = body?.kind;
        if (!name || (kind !== "income" && kind !== "expense")) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_fields" });
        }
        const created = await prisma_1.prisma.categories.create({
            data: {
                workspace_id: user.active_workspace_id,
                name,
                kind,
                icon: body?.icon ?? null,
                budget: body?.budget ?? null,
            },
        });
        const category = {
            id: created.id,
            name: created.name,
            kind: created.kind,
            icon: created.icon,
            budget: created.budget ? Number(created.budget) : null,
        };
        return reply.send({ category });
    });
    fastify.patch("/categories/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const categoryId = request.params.id;
        if (!categoryId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_id" });
        }
        const body = request.body;
        const name = body?.name?.trim();
        if (!name) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" });
        }
        const existing = await prisma_1.prisma.categories.findFirst({
            where: { id: categoryId, workspace_id: user.active_workspace_id },
        });
        if (!existing) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const duplicate = await prisma_1.prisma.categories.findFirst({
            where: {
                workspace_id: user.active_workspace_id,
                name: { equals: name, mode: "insensitive" },
                id: { not: categoryId },
            },
        });
        if (duplicate) {
            return reply.status(409).send({ error: "Conflict", code: "CATEGORY_NAME_EXISTS" });
        }
        const updated = await prisma_1.prisma.categories.update({
            where: { id: categoryId },
            data: { name, icon: body.icon ?? undefined, budget: body.budget ?? undefined },
        });
        const category = {
            id: updated.id,
            name: updated.name,
            kind: updated.kind,
            icon: updated.icon,
            budget: updated.budget ? Number(updated.budget) : null,
        };
        return reply.send({ category });
    });
    fastify.delete("/categories/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const categoryId = request.params.id;
        if (!categoryId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_id" });
        }
        const category = await prisma_1.prisma.categories.findFirst({
            where: { id: categoryId, workspace_id: user.active_workspace_id },
        });
        if (!category) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const txCount = await prisma_1.prisma.transactions.count({
            where: { workspace_id: user.active_workspace_id, category_id: categoryId },
        });
        if (txCount > 0) {
            return reply.status(409).send({ error: "Conflict", code: "CATEGORY_IN_USE" });
        }
        await prisma_1.prisma.categories.delete({ where: { id: categoryId } });
        return reply.status(204).send();
    });
}
