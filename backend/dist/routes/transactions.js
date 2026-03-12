"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorkspaceTransaction = createWorkspaceTransaction;
exports.transactionsRoutes = transactionsRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
class CreateTransactionError extends Error {
    statusCode;
    reason;
    constructor(statusCode, reason) {
        super(reason);
        this.statusCode = statusCode;
        this.reason = reason;
    }
}
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
            await reply.status(401).send({ error: "Unauthorized", reason });
            return null;
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
            await reply.status(401).send({ error: "Unauthorized", reason });
            return null;
        }
        const auth = await (0, telegramAuth_1.validateInitData)(initDataRaw);
        if (!auth) {
            reason = hasInitData ? "invalid_initdata" : "missing_initdata";
            request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
            await reply.status(401).send({ error: "Unauthorized", reason });
            return null;
        }
        userId = auth.userId;
    }
    return userId;
}
function resolveTransactionAuthorName(tx) {
    const creator = tx.created_by;
    if (!creator)
        return null;
    const firstName = creator.first_name?.trim();
    if (firstName)
        return firstName;
    const username = creator.username?.trim();
    if (username)
        return `@${username}`;
    return "Пользователь";
}
function mapTx(tx) {
    const description = tx.note ?? null;
    return {
        id: tx.id,
        kind: tx.kind,
        amount: Number(tx.amount),
        happenedAt: tx.happened_at.toISOString(),
        createdAt: tx.created_at.toISOString(),
        description,
        note: description,
        accountId: tx.account_id ?? null,
        accountName: tx.account?.name ?? tx.from_account?.name ?? null,
        categoryId: tx.category_id ?? null,
        fromAccountId: tx.from_account_id ?? null,
        fromAccountName: tx.from_account?.name ?? null,
        toAccountId: tx.to_account_id ?? null,
        toAccountName: tx.to_account?.name ?? null,
        incomeSourceId: tx.income_source_id ?? null,
        goalId: tx.goal_id ?? null,
        goalName: tx.goal?.name ?? null,
        debtorId: tx.debtor_id ?? null,
        debtorName: tx.debtor?.name ?? null,
        createdByUserId: tx.created_by_user_id ?? null,
        createdByName: resolveTransactionAuthorName(tx),
    };
}
async function createWorkspaceTransaction(workspaceId, body, createdByUserId) {
    if (!body?.kind || (body.kind !== "income" && body.kind !== "expense" && body.kind !== "transfer")) {
        throw new CreateTransactionError(400, "invalid_kind");
    }
    const kind = body.kind;
    if (!body.amount || !Number.isFinite(body.amount) || body.amount <= 0) {
        throw new CreateTransactionError(400, "invalid_amount");
    }
    const amount = new client_1.Prisma.Decimal(body.amount);
    const happenedAt = body.happenedAt ? new Date(body.happenedAt) : new Date();
    const resolvedDescription = body.description?.trim() || body.note?.trim() || null;
    if (Number.isNaN(happenedAt.getTime())) {
        throw new CreateTransactionError(400, "invalid_date");
    }
    const debtor = body.debtorId
        ? await prisma_1.prisma.debtors.findFirst({ where: { id: body.debtorId, workspace_id: workspaceId } })
        : null;
    if (body.debtorId && !debtor) {
        throw new CreateTransactionError(403, "debtor_not_in_workspace");
    }
    if (kind === "income" || kind === "expense") {
        if (!body.accountId) {
            throw new CreateTransactionError(400, "missing_account");
        }
        const account = await prisma_1.prisma.accounts.findFirst({
            where: { id: body.accountId, workspace_id: workspaceId, is_archived: false, archived_at: null },
        });
        if (!account) {
            throw new CreateTransactionError(403, "account_not_in_workspace");
        }
        if (body.categoryId) {
            const cat = await prisma_1.prisma.categories.findFirst({
                where: { id: body.categoryId, workspace_id: workspaceId, is_archived: false, archived_at: null },
            });
            if (!cat) {
                throw new CreateTransactionError(403, "category_not_in_workspace");
            }
        }
        if (body.incomeSourceId && kind !== "income") {
            throw new CreateTransactionError(400, "income_source_only_for_income");
        }
        if (kind === "income" && body.debtorId) {
            throw new CreateTransactionError(400, "debtor_income_not_allowed");
        }
        if (kind === "expense" && body.debtorId && debtor?.direction !== "PAYABLE") {
            throw new CreateTransactionError(400, "invalid_debtor_direction");
        }
        let incomeSourceId = null;
        if (kind === "income" && body.incomeSourceId) {
            const src = await prisma_1.prisma.income_sources.findFirst({
                where: { id: body.incomeSourceId, workspace_id: workspaceId, is_archived: false, archived_at: null },
            });
            if (!src) {
                throw new CreateTransactionError(403, "income_source_not_in_workspace");
            }
            incomeSourceId = src.id;
        }
        const tx = await prisma_1.prisma.$transaction(async (trx) => {
            const delta = kind === "income" ? amount : amount.neg();
            await trx.accounts.update({
                where: { id: account.id },
                data: { balance: { increment: delta } },
            });
            return trx.transactions.create({
                data: {
                    workspace_id: workspaceId,
                    created_by_user_id: createdByUserId ?? null,
                    kind,
                    amount,
                    happened_at: happenedAt,
                    note: resolvedDescription,
                    account_id: account.id,
                    category_id: body.categoryId ?? null,
                    income_source_id: incomeSourceId,
                    debtor_id: debtor?.id ?? null,
                },
            });
        });
        return mapTx(tx);
    }
    const isGoalTransfer = Boolean(body.goalId) && !body.toAccountId;
    const isDebtorRepayment = Boolean(body.debtorId) && !body.fromAccountId && Boolean(body.toAccountId);
    if (isDebtorRepayment) {
        if (debtor?.direction !== "RECEIVABLE") {
            throw new CreateTransactionError(400, "invalid_debtor_direction");
        }
        const to = await prisma_1.prisma.accounts.findFirst({
            where: { id: body.toAccountId ?? "", workspace_id: workspaceId, is_archived: false, archived_at: null },
        });
        if (!to) {
            throw new CreateTransactionError(403, "account_not_in_workspace");
        }
        const tx = await prisma_1.prisma.$transaction(async (trx) => {
            await trx.accounts.update({
                where: { id: to.id },
                data: { balance: { increment: amount } },
            });
            return trx.transactions.create({
                data: {
                    workspace_id: workspaceId,
                    created_by_user_id: createdByUserId ?? null,
                    kind,
                    amount,
                    happened_at: happenedAt,
                    note: resolvedDescription,
                    account_id: null,
                    from_account_id: null,
                    to_account_id: to.id,
                    goal_id: null,
                    debtor_id: debtor.id,
                },
            });
        });
        return mapTx(tx);
    }
    if (!body.fromAccountId) {
        throw new CreateTransactionError(400, "invalid_transfer_accounts");
    }
    const from = await prisma_1.prisma.accounts.findFirst({
        where: { id: body.fromAccountId, workspace_id: workspaceId, is_archived: false, archived_at: null },
    });
    if (!from) {
        throw new CreateTransactionError(403, "account_not_in_workspace");
    }
    if (isGoalTransfer) {
        const goal = await prisma_1.prisma.goals.findFirst({ where: { id: body.goalId ?? "", workspace_id: workspaceId } });
        if (!goal) {
            throw new CreateTransactionError(403, "goal_not_in_workspace");
        }
        const tx = await prisma_1.prisma.$transaction(async (trx) => {
            await trx.accounts.update({
                where: { id: from.id },
                data: { balance: { decrement: amount } },
            });
            await trx.goals.update({
                where: { id: goal.id },
                data: { current_amount: { increment: amount } },
            });
            return trx.transactions.create({
                data: {
                    workspace_id: workspaceId,
                    created_by_user_id: createdByUserId ?? null,
                    kind,
                    amount,
                    happened_at: happenedAt,
                    note: resolvedDescription,
                    account_id: null,
                    from_account_id: from.id,
                    to_account_id: null,
                    goal_id: goal.id,
                    debtor_id: null,
                },
            });
        });
        return mapTx(tx);
    }
    if (!body.toAccountId || body.fromAccountId === body.toAccountId) {
        throw new CreateTransactionError(400, "invalid_transfer_accounts");
    }
    const to = await prisma_1.prisma.accounts.findFirst({
        where: { id: body.toAccountId, workspace_id: workspaceId, is_archived: false, archived_at: null },
    });
    if (!to) {
        throw new CreateTransactionError(403, "account_not_in_workspace");
    }
    const tx = await prisma_1.prisma.$transaction(async (trx) => {
        await trx.accounts.update({
            where: { id: from.id },
            data: { balance: { decrement: amount } },
        });
        await trx.accounts.update({
            where: { id: to.id },
            data: { balance: { increment: amount } },
        });
        return trx.transactions.create({
            data: {
                workspace_id: workspaceId,
                created_by_user_id: createdByUserId ?? null,
                kind,
                amount,
                happened_at: happenedAt,
                note: resolvedDescription,
                from_account_id: from.id,
                to_account_id: to.id,
                debtor_id: null,
            },
        });
    });
    return mapTx(tx);
}
async function transactionsRoutes(fastify, _opts) {
    fastify.get("/transactions", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const goalId = request.query.goalId;
        const txs = await prisma_1.prisma.transactions.findMany({
            where: {
                workspace_id: user.active_workspace_id,
                ...(goalId ? { goal_id: goalId } : {}),
            },
            orderBy: { happened_at: "desc" },
            include: {
                created_by: { select: { id: true, first_name: true, username: true } },
                account: { select: { id: true, name: true } },
                from_account: { select: { id: true, name: true } },
                to_account: { select: { id: true, name: true } },
                goal: { select: { id: true, name: true } },
                debtor: { select: { id: true, name: true } },
            },
        });
        const payload = { transactions: txs.map(mapTx) };
        return reply.send(payload);
    });
    fastify.post("/transactions", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const body = request.body;
        try {
            const transaction = await createWorkspaceTransaction(user.active_workspace_id, body, userId);
            return reply.send({ transaction });
        }
        catch (error) {
            if (error instanceof CreateTransactionError) {
                const statusCode = error.statusCode === 403 ? 403 : 400;
                return reply.status(statusCode).send({
                    error: statusCode === 403 ? "Forbidden" : "Bad Request",
                    reason: error.reason,
                });
            }
            throw error;
        }
    });
    fastify.delete("/transactions/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const txId = request.params.id;
        const existing = await prisma_1.prisma.transactions.findFirst({
            where: { id: txId, workspace_id: user.active_workspace_id },
        });
        if (!existing) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const amount = existing.amount;
        const kind = existing.kind;
        await prisma_1.prisma.$transaction(async (trx) => {
            if (kind === "income" || kind === "expense") {
                if (!existing.account_id) {
                    throw new Error("Transaction missing account_id");
                }
                const delta = kind === "income" ? amount.neg() : amount;
                await trx.accounts.update({
                    where: { id: existing.account_id },
                    data: { balance: { increment: delta } },
                });
            }
            else if (kind === "transfer") {
                if (existing.goal_id) {
                    const sourceAccountId = existing.from_account_id ?? existing.account_id;
                    if (!sourceAccountId) {
                        throw new Error("Transaction missing goal transfer account");
                    }
                    await trx.accounts.update({
                        where: { id: sourceAccountId },
                        data: { balance: { increment: amount } },
                    });
                    await trx.goals.update({
                        where: { id: existing.goal_id },
                        data: { current_amount: { decrement: amount } },
                    });
                }
                else if (existing.debtor_id) {
                    if (!existing.to_account_id) {
                        throw new Error("Transaction missing debtor transfer destination account");
                    }
                    await trx.accounts.update({
                        where: { id: existing.to_account_id },
                        data: { balance: { decrement: amount } },
                    });
                }
                else {
                    if (!existing.from_account_id || !existing.to_account_id) {
                        throw new Error("Transaction missing transfer accounts");
                    }
                    await trx.accounts.update({
                        where: { id: existing.from_account_id },
                        data: { balance: { increment: amount } },
                    });
                    await trx.accounts.update({
                        where: { id: existing.to_account_id },
                        data: { balance: { decrement: amount } },
                    });
                }
            }
            await trx.transactions.delete({ where: { id: existing.id } });
        });
        return reply.status(204).send();
    });
}
