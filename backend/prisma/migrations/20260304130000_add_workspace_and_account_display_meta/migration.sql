ALTER TABLE "workspaces"
ADD COLUMN "icon_emoji" TEXT;

ALTER TABLE "accounts"
ADD COLUMN "display_name" TEXT,
ADD COLUMN "icon_emoji" TEXT;
