import { Router } from "express";
import { getHealth, ping } from "../controllers/health.controller";

export const healthRouter = Router();

healthRouter.get("/", getHealth);
healthRouter.get("/ping", ping);

export default healthRouter;
