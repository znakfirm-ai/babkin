"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const env_1 = require("./env");
const health_1 = require("./routes/health");
const me_1 = require("./routes/me");
const auth_1 = require("./routes/auth");
const workspaces_1 = require("./routes/workspaces");
const accounts_1 = require("./routes/accounts");
const categories_1 = require("./routes/categories");
const transactions_1 = require("./routes/transactions");
const incomeSources_1 = require("./routes/incomeSources");
const analytics_1 = require("./routes/analytics");
const goals_1 = require("./routes/goals");
const debtors_1 = require("./routes/debtors");
const fastify = (0, fastify_1.default)({
    logger: true,
});
fastify.register(cors_1.default, { origin: true });
fastify.register(health_1.healthRoutes);
fastify.register(auth_1.authRoutes, { prefix: "/api/v1" });
fastify.register(me_1.meRoutes, { prefix: "/api/v1" });
fastify.register(workspaces_1.workspacesRoutes, { prefix: "/api/v1" });
fastify.register(accounts_1.accountsRoutes, { prefix: "/api/v1" });
fastify.register(categories_1.categoriesRoutes, { prefix: "/api/v1" });
fastify.register(incomeSources_1.incomeSourcesRoutes, { prefix: "/api/v1" });
fastify.register(goals_1.goalsRoutes, { prefix: "/api/v1" });
fastify.register(debtors_1.debtorsRoutes, { prefix: "/api/v1" });
fastify.register(transactions_1.transactionsRoutes, { prefix: "/api/v1" });
fastify.register(analytics_1.analyticsRoutes, { prefix: "/api/v1" });
const port = Number(process.env.PORT) || env_1.env.PORT;
fastify
    .listen({ port, host: "0.0.0.0" })
    .then(() => {
    fastify.log.info(`listening on http://0.0.0.0:${port}`);
})
    .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
});
