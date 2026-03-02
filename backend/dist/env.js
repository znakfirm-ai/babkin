"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const baseSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    BOT_TOKEN: zod_1.z.string().optional(),
    TELEGRAM_BOT_TOKEN: zod_1.z.string().optional(),
    JWT_SECRET: zod_1.z.string().min(1, "JWT_SECRET is required"),
    PORT: zod_1.z.coerce.number().int().positive().default(3001),
    NODE_ENV: zod_1.z.string().default("development"),
});
const parsed = baseSchema.parse(process.env);
const normalizedBotToken = parsed.BOT_TOKEN ?? parsed.TELEGRAM_BOT_TOKEN;
if (!normalizedBotToken) {
    throw new Error("BOT_TOKEN is required (BOT_TOKEN or TELEGRAM_BOT_TOKEN)");
}
exports.env = {
    ...parsed,
    BOT_TOKEN: normalizedBotToken,
};
