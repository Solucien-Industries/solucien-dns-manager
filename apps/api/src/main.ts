import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");
  const configuredOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  const corsOrigin: CorsOptions["origin"] = (origin, callback) => {
    // Non-browser requests (curl, server-to-server) have no Origin header.
    if (!origin) return callback(null, true);

    if (configuredOrigins.includes(origin)) return callback(null, true);
    if (localhostOriginPattern.test(origin)) return callback(null, true);

    return callback(new Error(`CORS origin not allowed: ${origin}`));
  };

  // Global API prefix so routes live under /api (matches the web client).
  app.setGlobalPrefix("api");

  // Trust the first proxy hop so req.ip reflects the real client (X-Forwarded-For)
  // behind a load balancer. A fixed hop count (not `true`) avoids IP spoofing.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // Allow the Next.js dev origin (and anything in WEB_ORIGIN) to call the API.
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Validate + strip incoming DTOs.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Swagger / OpenAPI docs at /api/docs
  const config = new DocumentBuilder()
    .setTitle("Nani DNS API")
    .setDescription("Multi-tenant DNS hosting and management API (PowerDNS-backed).")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.log(`SDM API listening on http://localhost:${port}/api`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
