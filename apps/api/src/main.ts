import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  // Global API prefix so routes live under /api (matches the web client).
  app.setGlobalPrefix("api");

  // Trust the first proxy hop so req.ip reflects the real client (X-Forwarded-For)
  // behind a load balancer. A fixed hop count (not `true`) avoids IP spoofing.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // Allow the Next.js dev origin (and anything in WEB_ORIGIN) to call the API.
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(",") ?? ["http://localhost:3000"],
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
