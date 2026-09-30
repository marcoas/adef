-- CreateTable
CREATE TABLE "external_api_calls" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'plate_recognizer',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_api_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_api_calls_provider_created_at_idx" ON "external_api_calls"("provider", "created_at");
